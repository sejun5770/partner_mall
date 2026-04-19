import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { brandName } from "@/lib/brand";
import { getCommissionRate, calcCommission } from "@/lib/commission";

/**
 * GET /api/settlement
 *
 * Data source: bar_shop1 MSSQL (custom_order + COMPANY + custom_order_item + S2_Card).
 *
 * Business rules:
 *   - Only 발송완료 orders (src_send_date IS NOT NULL).
 *   - Excludes s2_barunsoncard (바른손카드 자체 주문; internal, not a partner).
 *   - Date filtering is on src_send_date (settlement month = shipment month).
 *   - 결제일/배송일 columns both display src_send_date per business spec.
 *
 * Query params:
 *   - page, pageSize
 *   - month=YYYY-MM  (takes precedence over dateFrom/dateTo)
 *   - dateFrom=YYYY-MM-DD, dateTo=YYYY-MM-DD
 *   - partnerShopId   admin-only; filters to one COMPANY_SEQ
 *   - partnerName     admin-only; LIKE partial match on COMPANY_NAME
 *
 * Authorization:
 *   - Non-admin: company_seq forced to user.partnerShopId.
 *   - Admin: optional company_seq / partnerName filters.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
  const month = searchParams.get("month"); // YYYY-MM
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  let filterCompanySeq: number | null;
  let partnerNameLike: string | null = null;
  if (user.isAdmin) {
    const q = searchParams.get("partnerShopId");
    filterCompanySeq = q ? parseInt(q) : null;
    const pn = searchParams.get("partnerName");
    partnerNameLike = pn ? `%${pn}%` : null;
  } else {
    filterCompanySeq = user.partnerShopId;
  }

  // Date range resolution (applied to src_send_date)
  let startDate: string;
  let endDateExcl: string;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    endDateExcl = `${ny}-${String(nm).padStart(2, "0")}-01`;
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    startDate = dateFrom || `${y}-${String(m).padStart(2, "0")}-01`;
    if (dateTo) {
      const d = new Date(`${dateTo}T00:00:00`);
      d.setDate(d.getDate() + 1);
      endDateExcl = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else {
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      endDateExcl = `${ny}-${String(nm).padStart(2, "0")}-01`;
    }
  }

  try {
    const pool = await getMssqlPool();

    const req = pool
      .request()
      .input("startDate", sql.Date, startDate)
      .input("endDateExcl", sql.Date, endDateExcl)
      .input("companySeq", sql.Int, filterCompanySeq)
      .input("partnerNameLike", sql.NVarChar, partnerNameLike)
      .input("offset", sql.Int, (page - 1) * pageSize)
      .input("pageSize", sql.Int, pageSize);

    // Shared WHERE clause: 발송완료 + exclude internal partner + optional filters
    const whereClause = `
      WHERE o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID <> 's2_barunsoncard'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
    `;

    // Summary
    // total_sales uses last_total_price — the final per-order total that already
    // rolls up surcharges (same-day shipping 오늘출발, binding 제본, envelopes, etc.)
    // and discounts (coupons, reduce_price) per the business spec.
    const summaryResult = await req.query<{
      total_orders: number;
      total_sales: number | null;
    }>(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(o.last_total_price), 0) AS total_sales
      FROM custom_order o
      JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
      ${whereClause}
    `);

    const summaryRow = summaryResult.recordset[0] ?? { total_orders: 0, total_sales: 0 };
    const totalOrders = summaryRow.total_orders ?? 0;
    const totalSales = Number(summaryRow.total_sales ?? 0);

    // List
    // - groom_fname / bride_fname come from custom_order_WeddInfo (given name only,
    //   without surname — this is the name actually printed on the wedding invitation).
    // - wedd_name is the venue name (예식장).
    // - payment_amount uses last_total_price per business spec (includes same-day shipping
    //   fees 오늘출발, binding fees 제본, coupon discounts, etc.).
    // - planner name: column not yet identified in bar_shop1; left as NULL (shown as '-').
    const listResult = await req.query<{
      order_seq: number;
      company_seq: number;
      login_id: string;
      company_name: string;
      order_date: Date;
      src_send_date: Date;
      order_name: string | null;
      groom_fname: string | null;
      bride_fname: string | null;
      wedd_name: string | null;
      card_code: string | null;
      card_brand: string | null;
      item_amount: number | null;
      payment_amount: number | null;
    }>(`
      SELECT
        o.order_seq,
        c.COMPANY_SEQ     AS company_seq,
        c.LOGIN_ID        AS login_id,
        c.COMPANY_NAME    AS company_name,
        o.order_date,
        o.src_send_date,
        o.order_name,
        w.groom_fname,
        w.bride_fname,
        w.wedd_name,
        (SELECT TOP 1 sc.Card_Code  FROM custom_order_item oi
           JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
           WHERE oi.order_seq = o.order_seq) AS card_code,
        (SELECT TOP 1 sc.CardBrand  FROM custom_order_item oi
           JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
           WHERE oi.order_seq = o.order_seq) AS card_brand,
        (SELECT SUM(oi.item_sale_price * oi.item_count)
           FROM custom_order_item oi
           WHERE oi.order_seq = o.order_seq) AS item_amount,
        o.last_total_price AS payment_amount
      FROM custom_order o
      JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
      OUTER APPLY (
        SELECT TOP 1 wi.groom_fname, wi.bride_fname, wi.wedd_name
        FROM custom_order_WeddInfo wi
        WHERE wi.order_seq = o.order_seq
        ORDER BY wi.id DESC
      ) w
      ${whereClause}
      ORDER BY o.src_send_date DESC, o.order_seq DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

    const settlements = listResult.recordset.map((r) => {
      const itemAmount = Number(r.item_amount ?? 0);
      const paymentAmount = Number(r.payment_amount ?? 0);
      const ratePct = getCommissionRate(r.company_seq);
      // Commission is charged on the actual payment amount (post all surcharges & discounts).
      const commission = calcCommission(paymentAmount, ratePct);
      const couple = [r.groom_fname, r.bride_fname]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(",");
      return {
        order_seq: r.order_seq,
        company_seq: r.company_seq,
        login_id: r.login_id,
        company_name: r.company_name,
        order_date: r.order_date,
        send_date: r.src_send_date,
        order_name: r.order_name ?? null,
        couple: couple || null,
        wedd_name: r.wedd_name ?? null,
        planner_name: null, // TODO: column not yet identified in bar_shop1
        card_code: r.card_code ?? "-",
        card_brand: brandName(r.card_brand),
        item_amount: itemAmount,
        payment_amount: paymentAmount,
        commission_rate: ratePct,
        commission_amount: commission,
      };
    });

    return NextResponse.json({
      settlements,
      summary: {
        total_orders: totalOrders,
        total_sales: totalSales,
        total_pg_amount: null,
        total_commission_paid: 0,
      },
      total: totalOrders,
      page,
      pageSize,
      isAdmin: user.isAdmin,
      filterCompanySeq,
    });
  } catch (error) {
    console.error("Settlement fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
