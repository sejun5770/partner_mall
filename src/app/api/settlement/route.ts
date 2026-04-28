import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { brandName } from "@/lib/brand";
import { categoryCaseSql, Category } from "@/lib/category";

/**
 * GET /api/settlement
 *
 * Category revenue split (per-order):
 *   invitation_slice = last_total_price - thankyou_items - goods_items
 *   thankyou_slice   = thankyou_items
 *   goods_slice      = goods_items
 *
 * This allocates all order-level fees and discounts (delivery, jebon,
 * coupon reduce_price, etc.) to the 청첩장 category when the order has
 * 청첩장 items — so:
 *   - 청첩장 탭 결제금액 = last_total_price MINUS the non-invitation item
 *     amounts (the bundled 답례품 / 기념굿즈 items are carved out).
 *   - 답례품 탭 / 기념굿즈 탭 결제금액 = that category's own items only.
 *   - For an order with all three categories present, the three slices
 *     sum back to last_total_price (cleanly partitioned).
 *
 * Orders without 청첩장 items: the slice for their own category is just
 * their items (fees in the order stay unattributed — negligible for this
 * iteration; can be revisited if needed).
 *
 * Row-level list mirrors the same model: when a category tab is active,
 * each list row represents one (order × that category) slice; when 전체
 * tab is active, rows are order-level with last_total_price.
 *
 * Excluded partners (internal accounts, not resellers):
 *   - s2_barunsoncard (바른손카드 자체)
 *   - deardeer        (디얼디어 내부 브랜드)
 *
 * Non-admin partners are locked to the 청첩장 category server-side.
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

  // dateBasis selects which custom_order column is used for the period
  // filter. Defaults to "order" so our totals line up with the production
  // portal's PG aggregate (which uses 주문일 by default).
  // 발송완료 (src_send_date IS NOT NULL) is still required regardless —
  // un-shipped orders never enter settlement.
  const dateBasis: "order" | "send" =
    searchParams.get("dateBasis") === "send" ? "send" : "order";
  const dateColumn = dateBasis === "send" ? "o.src_send_date" : "o.order_date";
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

  // Date range resolution
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

    const firstItemCategoryExpr = categoryCaseSql("fi.Card_Div", "fi.Card_Code");
    const itemCategoryExpr = categoryCaseSql("sc.Card_Div", "sc.Card_Code");

    // Excluded partner LOGIN_IDs (internal accounts, not resellers).
    //
    // 사고건 제외: custom_order.trouble_type is a string code. After checking
    // the live distribution over shipped orders since 2025-01, value '0' is
    // the overwhelming normal (~95k of 96k), and ~20 other non-'0' codes
    // (3601, 3002, 2803, ...) all represent some kind of incident. The
    // known 사고건 order 4733285 carries trouble_type='3601'. So keep only
    // trouble_type='0' for settlement. If a new non-incident code surfaces
    // later it can be added to the allow list.
    // Cancelled orders (src_cancel_date IS NOT NULL) are net-refunded by
    // the PG, so they should not show up in settlement. The production
    // portal's PG aggregate already nets them out — including this filter
    // both removes a real correctness bug and tightens the reconciliation
    // gap with the legacy report.
    const sharedFilters = `
      o.src_send_date IS NOT NULL
        AND o.src_cancel_date IS NULL
        AND ${dateColumn} >= @startDate
        AND ${dateColumn} <  @endDateExcl
        AND c.LOGIN_ID NOT IN ('s2_barunsoncard', 'deardeer')
        AND o.trouble_type = '0'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
    `;

    // Per-order item-category sums. Uses categoryCaseSql so any change to
    // the goods / thankyou / invitation rule (lib/category.ts) is honored
    // in both directions: categorisation here matches what the list query
    // displays in the "분류" column.
    const orderCatsCte = `
      order_cats AS (
        SELECT
          o.order_seq,
          MAX(o.last_total_price) AS ltp,
          SUM(CASE WHEN ${itemCategoryExpr} = 'invitation' THEN oi.item_sale_price * oi.item_count ELSE 0 END) AS inv_items,
          SUM(CASE WHEN ${itemCategoryExpr} = 'thankyou'   THEN oi.item_sale_price * oi.item_count ELSE 0 END) AS tya_items,
          SUM(CASE WHEN ${itemCategoryExpr} = 'goods'      THEN oi.item_sale_price * oi.item_count ELSE 0 END) AS gds_items,
          MAX(CASE WHEN ${itemCategoryExpr} = 'invitation' THEN 1 ELSE 0 END) AS has_inv,
          MAX(CASE WHEN ${itemCategoryExpr} = 'thankyou'   THEN 1 ELSE 0 END) AS has_tya,
          MAX(CASE WHEN ${itemCategoryExpr} = 'goods'      THEN 1 ELSE 0 END) AS has_gds
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN custom_order_item oi ON oi.order_seq = o.order_seq
        JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
        WHERE ${sharedFilters}
        GROUP BY o.order_seq
      )
    `;

    // ─── Overall summary (order-level) ───────────────────────────────
    // For non-admin, restrict to orders with invitation items.
    const overallExtraFilter = user.isAdmin ? "" : "AND has_inv = 1";
    const overallResult = await req.query<{
      total_orders: number;
      total_sales: number | null;
    }>(`
      WITH ${orderCatsCte}
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(ltp), 0) AS total_sales
      FROM order_cats
      WHERE 1 = 1 ${overallExtraFilter}
    `);

    const overall = overallResult.recordset[0];
    const totalOrders = Number(overall?.total_orders ?? 0);
    const totalSales = Number(overall?.total_sales ?? 0);

    // ─── Per-category summary ────────────────────────────────────────
    // invitation sales use the new slice formula; thankyou/goods stay
    // at their own items (fees unattributed for orders without 청첩장).
    const summaryResult = await req.query<{
      inv_orders: number;
      inv_sales: number | null;
      tya_orders: number;
      tya_sales: number | null;
      gds_orders: number;
      gds_sales: number | null;
    }>(`
      WITH ${orderCatsCte}
      SELECT
        SUM(CASE WHEN has_inv = 1 THEN 1 ELSE 0 END) AS inv_orders,
        COALESCE(SUM(CASE WHEN has_inv = 1 THEN ltp - tya_items - gds_items ELSE 0 END), 0) AS inv_sales,
        SUM(CASE WHEN has_tya = 1 THEN 1 ELSE 0 END) AS tya_orders,
        COALESCE(SUM(tya_items), 0) AS tya_sales,
        SUM(CASE WHEN has_gds = 1 THEN 1 ELSE 0 END) AS gds_orders,
        COALESCE(SUM(gds_items), 0) AS gds_sales
      FROM order_cats
      ${user.isAdmin ? "" : "WHERE has_inv = 1"}
    `);

    const s = summaryResult.recordset[0];
    const byCategory = {
      invitation: {
        orders: Number(s?.inv_orders ?? 0),
        sales: Number(s?.inv_sales ?? 0),
      },
      thankyou: {
        orders: Number(s?.tya_orders ?? 0),
        sales: Number(s?.tya_sales ?? 0),
      },
      goods: {
        orders: Number(s?.gds_orders ?? 0),
        sales: Number(s?.gds_sales ?? 0),
      },
    };

    // ─── List ────────────────────────────────────────────────────────
    type ListRow = {
      order_seq: number;
      company_seq: number;
      login_id: string;
      company_name: string;
      // SQL pre-formats dates as YYYY-MM-DD strings (CONVERT(VARCHAR(10), ..., 23))
      // to dodge a timezone shift. mssql returns DATETIME as UTC-assumed Date;
      // the browser then re-converts to KST adding +9h, which crosses midnight
      // and shows shipments from 2026-04-21 16:58 as "2026-04-22".
      order_date_str: string | null;
      send_date_str: string | null;
      order_name: string | null;
      planner_name: string | null;
      groom_name: string | null;
      bride_name: string | null;
      wedd_name: string | null;
      card_code: string | null;
      card_brand: string | null;
      card_div: string | null;
      category: Category;
      item_amount: number | null;
      payment_amount: number | null;
      // Resolved per-company from COMPANY.feeRate (NULL → 0). Computed in
      // SQL so the row total and the summary aggregation share one source
      // of truth without a JS-side N+1 lookup.
      commission_rate: number | null;
      commission_amount: number | null;
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
      listResult = await req.query<ListRow>(`
        WITH ${orderCatsCte},
        cat_slice AS (
          SELECT
            order_seq,
            CASE
              WHEN @category = 'invitation' THEN ltp - tya_items - gds_items
              WHEN @category = 'thankyou'   THEN tya_items
              WHEN @category = 'goods'      THEN gds_items
              ELSE 0
            END AS payment_amount
          FROM order_cats
          WHERE (@category = 'invitation' AND has_inv = 1)
             OR (@category = 'thankyou'   AND has_tya = 1)
             OR (@category = 'goods'      AND has_gds = 1)
        )
        SELECT
          o.order_seq,
          c.COMPANY_SEQ     AS company_seq,
          c.LOGIN_ID        AS login_id,
          c.COMPANY_NAME    AS company_name,
          CONVERT(VARCHAR(10), o.order_date, 23)    AS order_date_str,
          CONVERT(VARCHAR(10), o.src_send_date, 23) AS send_date_str,
          o.order_name,
          -- card_opt is reused by the partner front order flow as the
          -- "담당 플래너" free-text field — see partner.barunsoncard.com
          -- order_Wdd.asp step 1. NULL / empty when the partner skipped it.
          o.card_opt        AS planner_name,
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          @category         AS category,
          fi.CardSet_Price AS item_amount,
          cs.payment_amount,
          -- Per-company contract rate. NULL feeRate (inactive partners that
          -- somehow surface) defaults to 0% so we never invent a payout.
          COALESCE(c.feeRate, 0)                                    AS commission_rate,
          FLOOR(cs.payment_amount * COALESCE(c.feeRate, 0) / 100.0) AS commission_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN cat_slice cs ON cs.order_seq = o.order_seq
        OUTER APPLY (
          -- First item in the active category. CardSet_Price is the master
          -- catalog set price (소비자가), which is what the production portal
          -- shows. item_sale_price (실제 판매가) varies per order because of
          -- discounts and isn't what we want in the "소비자가격" column.
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, sc.CardSet_Price
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
      listResult = await req.query<ListRow>(`
        SELECT
          o.order_seq,
          c.COMPANY_SEQ     AS company_seq,
          c.LOGIN_ID        AS login_id,
          c.COMPANY_NAME    AS company_name,
          CONVERT(VARCHAR(10), o.order_date, 23)    AS order_date_str,
          CONVERT(VARCHAR(10), o.src_send_date, 23) AS send_date_str,
          o.order_name,
          o.card_opt        AS planner_name,
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          ${firstItemCategoryExpr} AS category,
          fi.CardSet_Price AS item_amount,
          o.last_total_price AS payment_amount,
          COALESCE(c.feeRate, 0)                                          AS commission_rate,
          FLOOR(o.last_total_price * COALESCE(c.feeRate, 0) / 100.0)      AS commission_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        OUTER APPLY (
          -- First item overall (전체 tab). See comment above on CardSet_Price.
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, sc.CardSet_Price
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
      const couple = [r.groom_name, r.bride_name]
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join(",");
      return {
        order_seq: r.order_seq,
        company_seq: r.company_seq,
        login_id: r.login_id,
        company_name: r.company_name,
        // 주문일 + 결제일 share order_date (partner orders use instant PG,
        // so payment date = order date — matches the original portal).
        // 배송일 uses src_send_date.
        order_date: r.order_date_str,
        pay_date: r.order_date_str,
        send_date: r.send_date_str,
        order_name: r.order_name ?? null,
        couple: couple || null,
        wedd_name: r.wedd_name ?? null,
        planner_name: (r.planner_name ?? "").trim() || null,
        card_code: r.card_code ?? "-",
        card_brand: brandName(r.card_brand),
        card_div: r.card_div ?? null,
        category: r.category,
        item_amount: Number(r.item_amount ?? 0),
        payment_amount: Number(r.payment_amount ?? 0),
        commission_rate: Number(r.commission_rate ?? 0),
        commission_amount: Number(r.commission_amount ?? 0),
      };
    });

    const filteredTotal = category ? byCategory[category].orders : totalOrders;

    // ─── 총 정산금액 ────────────────────────────────────────────────
    // 정산금액 = 매출 × COMPANY.feeRate. Computed per-company so partners
    // with different contract rates (10 / 13 / 15 / 5.5 / 23 / ...) all
    // contribute correctly to the headline. Slice base depends on the
    // active tab to mirror the list:
    //   invitation tab → ltp - tya_items - gds_items
    //   thankyou tab   → tya_items
    //   goods tab      → gds_items
    //   전체 (admin)   → ltp
    // FLOOR per-row before summing, matching the per-row commission_amount
    // we display. NULL feeRate (inactive partners) defaults to 0%.
    const commissionResult = await req.query<{ total_commission: number | null }>(`
      WITH ${orderCatsCte}
      SELECT COALESCE(SUM(FLOOR(
        CASE
          WHEN @category = 'invitation' THEN (oc.ltp - oc.tya_items - oc.gds_items)
          WHEN @category = 'thankyou'   THEN oc.tya_items
          WHEN @category = 'goods'      THEN oc.gds_items
          ELSE oc.ltp
        END
        * COALESCE(cc.feeRate, 0) / 100.0
      )), 0) AS total_commission
      FROM order_cats oc
      JOIN custom_order o2 ON o2.order_seq = oc.order_seq
      JOIN COMPANY cc      ON cc.COMPANY_SEQ = o2.company_seq
      WHERE 1 = 1
        ${
          category === "invitation"
            ? "AND oc.has_inv = 1"
            : category === "thankyou"
            ? "AND oc.has_tya = 1"
            : category === "goods"
            ? "AND oc.has_gds = 1"
            : user.isAdmin
            ? ""
            : "AND oc.has_inv = 1"
        }
    `);
    const totalCommissionPaid = Number(
      commissionResult.recordset[0]?.total_commission ?? 0
    );

    return NextResponse.json({
      settlements,
      summary: {
        total_orders: totalOrders,
        total_sales: totalSales,
        total_commission_paid: totalCommissionPaid,
        by_category: byCategory,
      },
      total: filteredTotal,
      page,
      pageSize,
      isAdmin: user.isAdmin,
      filterCompanySeq,
      category,
      dateBasis,
    });
  } catch (error) {
    console.error("Settlement fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
