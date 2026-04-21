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
 * Aggregation model (item-level throughout)
 * ----------------------------------------
 * An order with mixed items contributes its invitation items to the
 * 청첩장 category AND its goods items to 기념굿즈 AND its thankyou items
 * to 답례품 — each category's numbers are computed from the matching
 * items alone.
 *
 * - Per-category orders = COUNT(DISTINCT order_seq) of orders with at
 *   least one matching item.
 * - Per-category sales  = SUM(item_sale_price * item_count) of matching
 *   items only.
 *
 * List rows:
 * - When a category tab is active (?category=...), the list is at
 *   (order × that category) granularity: one row per order that has
 *   items in that category. 결제금액 = sum of items in that category
 *   for that order (so the 기념굿즈 tab shows 기념굿즈 revenue only,
 *   not the full order total). 주문카드/브랜드 use the first item
 *   that matches the category.
 * - When 전체 tab (?category= omitted), the list is order-level.
 *   결제금액 = last_total_price (true payment total including fees),
 *   주문카드/브랜드 = first item overall.
 *
 * Overall 총 결제금액 card stays at SUM(last_total_price) over distinct
 * orders.
 *
 * Other rules:
 * - Only 발송완료 orders (src_send_date IS NOT NULL).
 * - Excludes LOGIN_ID='s2_barunsoncard' (internal, not a partner).
 * - Non-admin partners are locked to the 청첩장 category server-side.
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
  const requestedCategory: Category | null =
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

  const category: Category | null = user.isAdmin ? requestedCategory : "invitation";

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

    const firstItemCategoryExpr = categoryCaseSql("fi.Card_Div");
    const itemCategoryExpr = categoryCaseSql("sc.Card_Div");

    const sharedFilters = `
      o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID <> 's2_barunsoncard'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
    `;

    // ─── Overall summary (order-level) ───────────────────────────────
    // For admin w/ no category: distinct orders in the filtered window.
    // For non-admin: restricted to orders with invitation items.
    const whereClauseOverall = user.isAdmin
      ? `WHERE ${sharedFilters}`
      : `WHERE ${sharedFilters}
           AND EXISTS (
             SELECT 1 FROM custom_order_item oi
             JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
             WHERE oi.order_seq = o.order_seq
               AND ${itemCategoryExpr} = 'invitation'
           )`;

    const overallResult = await req.query<{
      total_orders: number;
      total_sales: number | null;
    }>(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(o.last_total_price), 0) AS total_sales
      FROM custom_order o
      JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
      ${whereClauseOverall}
    `);

    const overall = overallResult.recordset[0];
    const totalOrders = Number(overall?.total_orders ?? 0);
    const totalSales = Number(overall?.total_sales ?? 0);

    // ─── Per-category breakdown (item-level) ─────────────────────────
    const categoryWhereForSummary = user.isAdmin ? "" : `AND ${itemCategoryExpr} = 'invitation'`;
    const perCategoryResult = await req.query<{
      cat: Category;
      orders: number;
      sales: number | null;
    }>(`
      SELECT
        ${itemCategoryExpr} AS cat,
        COUNT(DISTINCT o.order_seq) AS orders,
        COALESCE(SUM(oi.item_sale_price * oi.item_count), 0) AS sales
      FROM custom_order o
      JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
      JOIN custom_order_item oi ON oi.order_seq = o.order_seq
      JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
      WHERE ${sharedFilters}
        ${categoryWhereForSummary}
      GROUP BY ${itemCategoryExpr}
    `);

    const byCategory = {
      invitation: { orders: 0, sales: 0 },
      thankyou: { orders: 0, sales: 0 },
      goods: { orders: 0, sales: 0 },
    };
    for (const row of perCategoryResult.recordset) {
      if (row.cat === "invitation" || row.cat === "thankyou" || row.cat === "goods") {
        byCategory[row.cat] = {
          orders: Number(row.orders ?? 0),
          sales: Number(row.sales ?? 0),
        };
      }
    }

    // ─── List ────────────────────────────────────────────────────────
    // Two paths: category tab (per-order category slice) vs 전체 tab.
    type ListRow = {
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
    };

    const weddJoin = `
      OUTER APPLY (
        SELECT TOP 1 wi.groom_name, wi.bride_name, wi.wedd_name
        FROM custom_order_WeddInfo wi
        WHERE wi.order_seq = o.order_seq
        ORDER BY wi.id DESC
      ) w
    `;

    let listResult;
    if (category) {
      // Category tab: one row per order, but the displayed amounts only
      // include items in this category. The order's full card/brand is
      // replaced by the first-in-category item's card/brand.
      listResult = await req.query<ListRow>(`
        WITH cat_slice AS (
          SELECT
            o.order_seq,
            SUM(oi.item_sale_price * oi.item_count) AS amount
          FROM custom_order o
          JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
          JOIN custom_order_item oi ON oi.order_seq = o.order_seq
          JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
          WHERE ${sharedFilters}
            AND ${itemCategoryExpr} = @category
          GROUP BY o.order_seq
        )
        SELECT
          o.order_seq,
          c.COMPANY_SEQ     AS company_seq,
          c.LOGIN_ID        AS login_id,
          c.COMPANY_NAME    AS company_name,
          o.order_date,
          o.src_send_date,
          o.order_name,
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          @category         AS category,
          cs.amount         AS item_amount,
          cs.amount         AS payment_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN cat_slice cs ON cs.order_seq = o.order_seq
        OUTER APPLY (
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div
          FROM custom_order_item oi
          JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
          WHERE oi.order_seq = o.order_seq
            AND ${itemCategoryExpr} = @category
          ORDER BY oi.id ASC
        ) fi
        ${weddJoin}
        ORDER BY o.src_send_date DESC, o.order_seq DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);
    } else {
      // 전체 tab: order-level. Amount = last_total_price (full payment).
      // For non-admin the EXISTS predicate on invitation already applied
      // via whereClauseOverall, but the list should apply it too; since
      // non-admin always sets category="invitation", this else branch is
      // unreachable for non-admin.
      listResult = await req.query<ListRow>(`
        SELECT
          o.order_seq,
          c.COMPANY_SEQ     AS company_seq,
          c.LOGIN_ID        AS login_id,
          c.COMPANY_NAME    AS company_name,
          o.order_date,
          o.src_send_date,
          o.order_name,
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          ${firstItemCategoryExpr} AS category,
          (SELECT SUM(oi.item_sale_price * oi.item_count)
             FROM custom_order_item oi
             WHERE oi.order_seq = o.order_seq) AS item_amount,
          o.last_total_price AS payment_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        OUTER APPLY (
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div
          FROM custom_order_item oi
          JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
          WHERE oi.order_seq = o.order_seq
          ORDER BY oi.id ASC
        ) fi
        ${weddJoin}
        WHERE ${sharedFilters}
        ORDER BY o.src_send_date DESC, o.order_seq DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);
    }

    const settlements = listResult.recordset.map((r) => {
      const itemAmount = Number(r.item_amount ?? 0);
      const paymentAmount = Number(r.payment_amount ?? 0);
      const ratePct = getCommissionRate(r.company_seq);
      // Commission uses the displayed payment amount: per-category slice
      // in category mode, true payment total in 전체 mode.
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
        planner_name: null, // TODO: planner column not yet identified
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

    const filteredTotal = category ? byCategory[category].orders : totalOrders;

    return NextResponse.json({
      settlements,
      summary: {
        total_orders: totalOrders,
        total_sales: totalSales,
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
