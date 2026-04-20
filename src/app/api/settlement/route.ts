import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { brandName } from "@/lib/brand";
import { getCommissionRate, calcCommission } from "@/lib/commission";
import { categoryCaseSql, Category } from "@/lib/category";

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
 *   - Category is derived from the first item's S2_Card.Card_Div:
 *       A01 → invitation (청첩장), A03 → thankyou (답례품), else → goods (기념굿즈).
 *
 * Query params:
 *   - page, pageSize
 *   - month=YYYY-MM  (takes precedence over dateFrom/dateTo)
 *   - dateFrom=YYYY-MM-DD, dateTo=YYYY-MM-DD
 *   - category=invitation|thankyou|goods
 *   - partnerShopId   admin-only; filters to one COMPANY_SEQ
 *   - partnerName     admin-only; LIKE partial match on COMPANY_NAME
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
  const month = searchParams.get("month");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const rawCategory = searchParams.get("category");
  const category: Category | null =
    rawCategory === "invitation" || rawCategory === "thankyou" || rawCategory === "goods"
      ? rawCategory
      : null;

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
      .input("category", sql.VarChar, category)
      .input("offset", sql.Int, (page - 1) * pageSize)
      .input("pageSize", sql.Int, pageSize);

    // The derived category for an order comes from the first item's Card_Div.
    // Expose it once via OUTER APPLY and reuse for filter + display + summary.
    const categoryExpr = categoryCaseSql("fi.Card_Div");

    const baseFrom = `
      FROM custom_order o
      JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
      OUTER APPLY (
        SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div
        FROM custom_order_item oi
        JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
        WHERE oi.order_seq = o.order_seq
        ORDER BY oi.id ASC
      ) fi
    `;

    // WHERE for the LIST query — includes the optional category filter so
    // pagination/ordering apply to the filtered subset.
    const whereClauseList = `
      WHERE o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID <> 's2_barunsoncard'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
        AND (@category IS NULL OR ${categoryExpr} = @category)
    `;

    // WHERE for the SUMMARY query — intentionally DOES NOT apply the category
    // filter. The per-category breakdown powers the tab counts, which must
    // stay stable as the user switches tabs; if we filtered by category here,
    // the "전체" tab's count would collapse to just the active category.
    const whereClauseSummary = `
      WHERE o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID <> 's2_barunsoncard'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
    `;

    // Summary (overall + per-category breakdown)
    const summaryResult = await req.query<{
      total_orders: number;
      total_sales: number | null;
      invitation_orders: number;
      invitation_sales: number | null;
      thankyou_orders: number;
      thankyou_sales: number | null;
      goods_orders: number;
      goods_sales: number | null;
    }>(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(o.last_total_price), 0) AS total_sales,
        SUM(CASE WHEN ${categoryExpr} = 'invitation' THEN 1 ELSE 0 END) AS invitation_orders,
        COALESCE(SUM(CASE WHEN ${categoryExpr} = 'invitation' THEN o.last_total_price ELSE 0 END), 0) AS invitation_sales,
        SUM(CASE WHEN ${categoryExpr} = 'thankyou' THEN 1 ELSE 0 END) AS thankyou_orders,
        COALESCE(SUM(CASE WHEN ${categoryExpr} = 'thankyou' THEN o.last_total_price ELSE 0 END), 0) AS thankyou_sales,
        SUM(CASE WHEN ${categoryExpr} = 'goods' THEN 1 ELSE 0 END) AS goods_orders,
        COALESCE(SUM(CASE WHEN ${categoryExpr} = 'goods' THEN o.last_total_price ELSE 0 END), 0) AS goods_sales
      ${baseFrom}
      ${whereClauseSummary}
    `);

    const s = summaryResult.recordset[0];
    const totalOrders = Number(s?.total_orders ?? 0);
    const totalSales = Number(s?.total_sales ?? 0);

    // List
    const listResult = await req.query<{
      order_seq: number;
      company_seq: number;
      login_id: string;
      company_name: string;
      order_date: Date;
      src_send_date: Date;
      order_name: string | null;
      groom_name: string | null;
      bride_name: string | null;
      wedd_name: string | null;
      card_code: string | null;
      card_brand: string | null;
      card_div: string | null;
      category: Category;
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
        -- groom_name/bride_name hold the given name (이름); *_fname columns
        -- in this schema are the family name (성), which is not what we
        -- want to display next to the partner's settlement row.
        w.groom_name,
        w.bride_name,
        w.wedd_name,
        fi.Card_Code      AS card_code,
        fi.CardBrand      AS card_brand,
        fi.Card_Div       AS card_div,
        ${categoryExpr}   AS category,
        (SELECT SUM(oi.item_sale_price * oi.item_count)
           FROM custom_order_item oi
           WHERE oi.order_seq = o.order_seq) AS item_amount,
        o.last_total_price AS payment_amount
      ${baseFrom}
      OUTER APPLY (
        SELECT TOP 1 wi.groom_name, wi.bride_name, wi.wedd_name
        FROM custom_order_WeddInfo wi
        WHERE wi.order_seq = o.order_seq
        ORDER BY wi.id DESC
      ) w
      ${whereClauseList}
      ORDER BY o.src_send_date DESC, o.order_seq DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

    const settlements = listResult.recordset.map((r) => {
      const itemAmount = Number(r.item_amount ?? 0);
      const paymentAmount = Number(r.payment_amount ?? 0);
      const ratePct = getCommissionRate(r.company_seq);
      const commission = calcCommission(paymentAmount, ratePct);
      const couple = [r.groom_name, r.bride_name]
        .map((x) => (x ?? "").trim())
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
        card_div: r.card_div ?? null,
        category: r.category,
        item_amount: itemAmount,
        payment_amount: paymentAmount,
        commission_rate: ratePct,
        commission_amount: commission,
      };
    });

    const byCategory = {
      invitation: {
        orders: Number(s?.invitation_orders ?? 0),
        sales: Number(s?.invitation_sales ?? 0),
      },
      thankyou: {
        orders: Number(s?.thankyou_orders ?? 0),
        sales: Number(s?.thankyou_sales ?? 0),
      },
      goods: {
        orders: Number(s?.goods_orders ?? 0),
        sales: Number(s?.goods_sales ?? 0),
      },
    };

    // Pagination `total` must reflect the LIST query (category-aware); the
    // summary numbers are intentionally unfiltered so tab counts stay stable.
    const filteredTotal = category ? byCategory[category].orders : totalOrders;

    return NextResponse.json({
      settlements,
      summary: {
        total_orders: totalOrders,
        total_sales: totalSales,
        total_pg_amount: null,
        total_commission_paid: 0,
        by_category: byCategory,
      },
      total: filteredTotal,
      page,
      pageSize,
      isAdmin: user.isAdmin,
      filterCompanySeq,
      category,
    });
  } catch (error) {
    console.error("Settlement fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
