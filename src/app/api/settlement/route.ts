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
 * Data source: bar_shop1 MSSQL.
 *
 * Aggregation model (item-level):
 *   - The per-category breakdown is aggregated at the `custom_order_item`
 *     × `S2_Card.Card_Div` level. A single order that bundles items from
 *     multiple categories contributes to each of those categories — its
 *     invitation items count toward 청첩장, its goods items toward 기념굿즈,
 *     and so on.
 *   - Per-category sales = SUM(item_sale_price * item_count) for matching
 *     items only (does NOT include order-level fees — delivery, jebon,
 *     coupons — since those cannot be cleanly attributed to an item).
 *   - The overall 총 결제금액 card uses SUM(last_total_price) per distinct
 *     order, which IS the true payment total (includes all fees and
 *     discounts). The sum of the three category "sales" will typically be
 *     less than the overall 총 결제금액 because of those fees.
 *
 * Business rules:
 *   - Only 발송완료 orders (src_send_date IS NOT NULL).
 *   - Excludes s2_barunsoncard (내부 자체 주문, not a partner).
 *   - Date range is applied on src_send_date (settlement = shipment month).
 *   - Non-admin partners are locked to the 청첩장 category server-side.
 *
 * Query params:
 *   - page, pageSize
 *   - month=YYYY-MM  (takes precedence over dateFrom/dateTo)
 *   - dateFrom=YYYY-MM-DD, dateTo=YYYY-MM-DD
 *   - category=invitation|thankyou|goods  (admin only; ignored for partner)
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

    // First-item category (used for the list row's "분류" badge and for the
    // order's primary card code/brand). List filtering uses EXISTS instead,
    // so a mixed order can still match via a non-primary item.
    const firstItemCategoryExpr = categoryCaseSql("fi.Card_Div");
    const itemCategoryExpr = categoryCaseSql("sc.Card_Div");

    const baseOrderJoins = `
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

    // Shared filters (no category predicate yet)
    const sharedFilters = `
      o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID <> 's2_barunsoncard'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
    `;

    // Existence-based category predicate: an order matches the category if
    // at least one of its items belongs to that category.
    const categoryExistsPredicate = `
      EXISTS (
        SELECT 1
        FROM custom_order_item oi
        JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
        WHERE oi.order_seq = o.order_seq
          AND ${itemCategoryExpr} = @category
      )
    `;

    const whereClauseList = `
      WHERE ${sharedFilters}
        AND (@category IS NULL OR ${categoryExistsPredicate})
    `;

    // Overall summary (order-level): distinct order count + SUM(last_total_price)
    // for the true payment amount. For non-admin we also apply the category
    // predicate so totals match the restricted scope.
    const whereClauseOverall = user.isAdmin
      ? `WHERE ${sharedFilters}`
      : `WHERE ${sharedFilters} AND ${categoryExistsPredicate.replace("@category", "'invitation'")}`;

    const overallResult = await req.query<{
      total_orders: number;
      total_sales: number | null;
    }>(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(o.last_total_price), 0) AS total_sales
      ${baseOrderJoins}
      ${whereClauseOverall}
    `);

    const overall = overallResult.recordset[0];
    const totalOrders = Number(overall?.total_orders ?? 0);
    const totalSales = Number(overall?.total_sales ?? 0);

    // Per-category breakdown (item-level). Admin gets all three; non-admin
    // only invitation (thankyou/goods come back zero because their items
    // aren't joined for this user's scope).
    const categoryWhereForSummary = user.isAdmin
      ? ""
      : `AND ${itemCategoryExpr} = 'invitation'`;
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

    // List — paginated, one row per order. Filter by EXISTS so mixed orders
    // still match via any item. Display category = first item's category.
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
        w.groom_name,
        w.bride_name,
        w.wedd_name,
        fi.Card_Code      AS card_code,
        fi.CardBrand      AS card_brand,
        fi.Card_Div       AS card_div,
        ${firstItemCategoryExpr}   AS category,
        (SELECT SUM(oi.item_sale_price * oi.item_count)
           FROM custom_order_item oi
           WHERE oi.order_seq = o.order_seq) AS item_amount,
        o.last_total_price AS payment_amount
      ${baseOrderJoins}
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

    // Pagination total: when a category is active, use the category's order
    // count (distinct orders in that category); otherwise the overall total.
    const filteredTotal = category ? byCategory[category].orders : totalOrders;

    return NextResponse.json({
      settlements,
      summary: {
        total_orders: totalOrders,
        total_sales: totalSales,
        total_commission_paid: 0, // not implemented (closing table TBD)
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
