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

    const firstItemCategoryExpr = categoryCaseSql("fi.Card_Div");
    const itemCategoryExpr = categoryCaseSql("sc.Card_Div");

    // Excluded partner LOGIN_IDs (internal accounts, not resellers)
    // 사고건(trouble_type 값이 있는 주문)은 정산 대상에서 제외.
    const sharedFilters = `
      o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID NOT IN ('s2_barunsoncard', 'deardeer')
        AND (o.trouble_type IS NULL OR LTRIM(RTRIM(o.trouble_type)) = '')
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
    `;

    // Per-order item-category sums. Reused by summary + category-mode list.
    const orderCatsCte = `
      order_cats AS (
        SELECT
          o.order_seq,
          MAX(o.last_total_price) AS ltp,
          SUM(CASE WHEN sc.Card_Div = 'A01' THEN oi.item_sale_price * oi.item_count ELSE 0 END) AS inv_items,
          SUM(CASE WHEN sc.Card_Div = 'A03' THEN oi.item_sale_price * oi.item_count ELSE 0 END) AS tya_items,
          SUM(CASE WHEN sc.Card_Div NOT IN ('A01','A03') THEN oi.item_sale_price * oi.item_count ELSE 0 END) AS gds_items,
          MAX(CASE WHEN sc.Card_Div = 'A01' THEN 1 ELSE 0 END) AS has_inv,
          MAX(CASE WHEN sc.Card_Div = 'A03' THEN 1 ELSE 0 END) AS has_tya,
          MAX(CASE WHEN sc.Card_Div NOT IN ('A01','A03') THEN 1 ELSE 0 END) AS has_gds
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
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          @category         AS category,
          fi.item_sale_price AS item_amount,
          cs.payment_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN cat_slice cs ON cs.order_seq = o.order_seq
        OUTER APPLY (
          -- First item in the active category. Its item_sale_price is the
          -- per-unit 소비자가격 shown in the list row.
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, oi.item_sale_price
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
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          ${firstItemCategoryExpr} AS category,
          fi.item_sale_price AS item_amount,
          o.last_total_price AS payment_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        OUTER APPLY (
          -- First item overall (전체 tab). Its item_sale_price is the
          -- per-unit 소비자가격 shown in the list row.
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, oi.item_sale_price
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
        // 주문일 + 결제일 share order_date (partner orders use instant PG,
        // so payment date = order date — matches the original portal).
        // 배송일 uses src_send_date.
        order_date: r.order_date_str,
        pay_date: r.order_date_str,
        send_date: r.send_date_str,
        order_name: r.order_name ?? null,
        couple: couple || null,
        wedd_name: r.wedd_name ?? null,
        planner_name: null, // TODO
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
