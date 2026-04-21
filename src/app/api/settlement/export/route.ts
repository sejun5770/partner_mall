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
 * Returns the full (unpaginated) settlement list for the currently active
 * filters as a CSV download. Mirrors the logic of /api/settlement — the
 * only differences are: no OFFSET/FETCH (all rows), no summary aggregates,
 * CSV response instead of JSON.
 *
 * Encoded as UTF-8 with BOM so Excel opens the Korean headers correctly.
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

  // Date range resolution (same as list endpoint)
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

    const firstItemCategoryExpr = categoryCaseSql("fi.Card_Div");
    const itemCategoryExpr = categoryCaseSql("sc.Card_Div");

    const result = await req.query<{
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
      FROM custom_order o
      JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
      OUTER APPLY (
        SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div
        FROM custom_order_item oi
        JOIN S2_Card sc ON oi.card_seq = sc.Card_Seq
        WHERE oi.order_seq = o.order_seq
        ORDER BY oi.id ASC
      ) fi
      OUTER APPLY (
        SELECT TOP 1 wi.groom_name, wi.bride_name, wi.wedd_name
        FROM custom_order_WeddInfo wi
        WHERE wi.order_seq = o.order_seq
        ORDER BY wi.id DESC
      ) w
      WHERE o.src_send_date IS NOT NULL
        AND o.src_send_date >= @startDate
        AND o.src_send_date <  @endDateExcl
        AND c.LOGIN_ID <> 's2_barunsoncard'
        AND (@companySeq IS NULL OR o.company_seq = @companySeq)
        AND (@partnerNameLike IS NULL OR c.COMPANY_NAME LIKE @partnerNameLike)
        AND (@category IS NULL OR EXISTS (
          SELECT 1
          FROM custom_order_item oi
          JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
          WHERE oi.order_seq = o.order_seq
            AND ${itemCategoryExpr} = @category
        ))
      ORDER BY o.src_send_date DESC, o.order_seq DESC
    `);

    // Build CSV
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
      "수수료",
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
      const sendDate = r.src_send_date
        ? new Date(r.src_send_date).toLocaleDateString("ko-KR")
        : "";
      const orderDate = r.order_date
        ? new Date(r.order_date).toLocaleDateString("ko-KR")
        : "";

      return [
        ...(user.isAdmin ? [r.login_id, r.company_name] : []),
        String(r.order_seq),
        ...(user.isAdmin ? [CATEGORY_LABEL[r.category] ?? ""] : []),
        "발송완료",
        orderDate,
        sendDate,
        sendDate,
        r.order_name ?? "",
        couple,
        r.wedd_name ?? "",
        "", // planner name: column not yet identified
        r.card_code ?? "",
        brandName(r.card_brand),
        String(itemAmount),
        "", // 공급가액: not yet mapped
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

    const bom = "\uFEFF";
    const body = bom + csvBody;

    const filename = `settlement_${startDate}_${endDateExcl}.csv`;

    return new NextResponse(body, {
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
