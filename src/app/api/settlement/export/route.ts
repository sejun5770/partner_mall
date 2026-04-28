import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { brandName } from "@/lib/brand";
import { getCommissionRate, calcCommission } from "@/lib/commission";
import { categoryCaseSql, Category, CATEGORY_LABEL } from "@/lib/category";

/**
 * GET /api/settlement/export
 *
 * CSV download of the current filter set (same semantics as the list
 * endpoint). Encoded UTF-8 + BOM for Excel.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const rawCategory = searchParams.get("category");
  const requestedCategory: Category | null =
    rawCategory === "invitation" || rawCategory === "thankyou" || rawCategory === "goods"
      ? rawCategory
      : null;

  // Same date-basis switch as the list endpoint, default 주문일.
  const dateBasis: "order" | "send" =
    searchParams.get("dateBasis") === "send" ? "send" : "order";
  const dateColumn = dateBasis === "send" ? "o.src_send_date" : "o.order_date";

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
      .input("category", sql.VarChar, category);

    const firstItemCategoryExpr = categoryCaseSql("fi.Card_Div", "fi.Card_Code");
    const itemCategoryExpr = categoryCaseSql("sc.Card_Div", "sc.Card_Code");

    // trouble_type='0' only — non-'0' codes are incidents (see
    // /api/settlement/route.ts for the rationale).
    // Mirrors the list endpoint — cancelled orders excluded.
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

    type ExportRow = {
      order_seq: number;
      company_seq: number;
      login_id: string;
      company_name: string;
      // Pre-formatted YYYY-MM-DD strings to avoid timezone drift.
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
    };

    const weddJoin = `
      OUTER APPLY (
        SELECT TOP 1 wi.groom_name, wi.bride_name, wi.wedd_name
        FROM custom_order_WeddInfo wi
        WHERE wi.order_seq = o.order_seq
        ORDER BY wi.id DESC
      ) w
    `;

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

    let result;
    if (category) {
      result = await req.query<ExportRow>(`
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
          -- order_Wdd.asp step 1.
          o.card_opt        AS planner_name,
          w.groom_name,
          w.bride_name,
          w.wedd_name,
          fi.Card_Code      AS card_code,
          fi.CardBrand      AS card_brand,
          fi.Card_Div       AS card_div,
          @category         AS category,
          fi.CardSet_Price AS item_amount,
          cs.payment_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN cat_slice cs ON cs.order_seq = o.order_seq
        OUTER APPLY (
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, sc.CardSet_Price
          FROM custom_order_item oi
          JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
          WHERE oi.order_seq = o.order_seq
            AND ${itemCategoryExpr} = @category
          ORDER BY oi.id ASC
        ) fi
        ${weddJoin}
        ORDER BY o.src_send_date DESC, o.order_seq DESC
      `);
    } else {
      result = await req.query<ExportRow>(`
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
          o.last_total_price AS payment_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        OUTER APPLY (
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, sc.CardSet_Price
          FROM custom_order_item oi
          JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
          WHERE oi.order_seq = o.order_seq
          ORDER BY oi.id ASC
        ) fi
        ${weddJoin}
        WHERE ${sharedFilters}
        ORDER BY o.src_send_date DESC, o.order_seq DESC
      `);
    }

    const headers = [
      ...(user.isAdmin ? ["아이디", "제휴사명"] : []),
      "주문번호",
      ...(user.isAdmin ? ["분류"] : []),
      "주문상태",
      "주문일",
      "결제일",
      "배송일",
      "주문자",
      "신랑,신부",
      "예식장",
      "플래너명",
      "주문카드",
      "브랜드",
      "소비자가격",
      "공급가액",
      "결제금액",
      "수수료율",
      "정산금액",
    ];

    const rows = result.recordset.map((r) => {
      const paymentAmount = Number(r.payment_amount ?? 0);
      const itemAmount = Number(r.item_amount ?? 0);
      const ratePct = getCommissionRate(r.company_seq);
      const commission = calcCommission(paymentAmount, ratePct);
      const couple = [r.groom_name, r.bride_name]
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join(",");
      const orderDate = r.order_date_str ?? "";
      const sendDate = r.send_date_str ?? "";

      return [
        ...(user.isAdmin ? [r.login_id, r.company_name] : []),
        String(r.order_seq),
        ...(user.isAdmin ? [CATEGORY_LABEL[r.category] ?? ""] : []),
        "발송완료",
        orderDate,
        // 결제일 mirrors 주문일 (partner orders = instant PG settlement)
        orderDate,
        sendDate,
        r.order_name ?? "",
        couple,
        r.wedd_name ?? "",
        (r.planner_name ?? "").trim(),
        r.card_code ?? "",
        brandName(r.card_brand),
        String(itemAmount),
        "",
        String(paymentAmount),
        `${ratePct}%`,
        String(commission),
      ];
    });

    const escapeCsv = (v: string) => {
      if (v == null) return "";
      const needsQuote = /[",\n\r]/.test(v);
      const s = v.replace(/"/g, '""');
      return needsQuote ? `"${s}"` : s;
    };

    const csvBody = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\r\n");

    const filename = `settlement_${startDate}_${endDateExcl}${category ? `_${category}` : ""}.csv`;

    return new NextResponse("\uFEFF" + csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Settlement export error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
