import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { brandName } from "@/lib/brand";
import { categoryCaseSql, Category } from "@/lib/category";

/**
 * GET /api/settlement/export
 *
 * CSV download. Column layout matches the operations team's existing
 * 32-column reporting template, so admins can drop the export straight
 * into their accounting workbook without re-mapping. Encoded UTF-8 + BOM
 * for Excel.
 *
 * Filter semantics mirror /api/settlement (date basis, partner filter,
 * category, cancel exclude, trouble_type='0', etc.) so what's on screen
 * is what comes out of the file, row-for-row.
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

    // Mirrors the list endpoint — see /api/settlement/route.ts for the
    // full rationale on each clause (cancelled / trouble / excluded
    // partner accounts).
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
      erp_part_code: string | null;
      mng_nm: string | null;
      planner_name: string | null;
      order_add_flag: string | null;
      pg_resultinfo: string | null;
      pg_resultinfo2: string | null;
      // FLOOR(last_total_price / 1.1) when the order is processed in-house
      // (OUTSOURCING_TYPE IS NULL); 0 for outsourced orders that don't carry
      // VAT through Barunson's books. Computed in SQL to match the legacy
      // accounting workbook's split.
      supply_amount: number | null;
      // Pre-formatted YYYY-MM-DD strings to avoid timezone drift.
      order_date_str: string | null;
      send_date_str: string | null;
      cancel_date_str: string | null;
      order_name: string | null;
      order_hphone: string | null;
      groom_name: string | null;
      bride_name: string | null;
      wedd_name: string | null;
      // 층/홀/실 (e.g., "1층 루비홀") — separate free-text input on the
      // partner front order_Wdd.asp form, stored next to wedd_name.
      wedd_place: string | null;
      wedd_date_str: string | null;
      ftype: string | null;
      card_code: string | null;
      card_brand: string | null;
      card_div: string | null;
      item_count: number | null;
      category: Category;
      item_amount: number | null;
      payment_amount: number | null;
      commission_rate: number | null;
      commission_amount: number | null;
    };

    // WeddInfo subquery — also builds the YYYY-MM-DD wedding date from
    // event_year/month/Day so the timezone-conversion problem we hit on
    // src_send_date doesn't recur. Months/days may be unpadded ('6', '20')
    // in the source — RIGHT('0' + ..., 2) zero-pads.
    const weddJoin = `
      OUTER APPLY (
        SELECT TOP 1
          wi.groom_name,
          wi.bride_name,
          wi.wedd_name,
          wi.wedd_place,
          wi.ftype,
          CASE
            WHEN ISNULL(wi.event_year, '') = '' THEN NULL
            ELSE wi.event_year + '-'
              + RIGHT('0' + ISNULL(wi.event_month, ''), 2) + '-'
              + RIGHT('0' + ISNULL(wi.event_Day,   ''), 2)
          END AS wedd_date_str
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

    // Common SELECT projection (everything the new column set needs).
    const projection = `
      o.order_seq,
      c.COMPANY_SEQ     AS company_seq,
      c.LOGIN_ID        AS login_id,
      c.COMPANY_NAME    AS company_name,
      c.ERP_PartCode    AS erp_part_code,
      c.MNG_NM          AS mng_nm,
      o.card_opt        AS planner_name,
      o.order_add_flag,
      -- Real payment method/provider lives on the PG result fields, not
      -- pay_Type (which is a coarse legacy code; ~100% '0' for current
      -- partner-flow orders so it carries no signal). pg_resultinfo holds
      -- the bank/card/payment-rail name; pg_resultinfo2 holds extra info
      -- like the simple-pay provider (카카오페이) or card auth number.
      o.pg_resultinfo,
      o.pg_resultinfo2,
      CASE
        WHEN o.OUTSOURCING_TYPE IS NULL
          THEN FLOOR(o.last_total_price / 1.1)
        ELSE 0
      END AS supply_amount,
      CONVERT(VARCHAR(10), o.order_date,      23) AS order_date_str,
      CONVERT(VARCHAR(10), o.src_send_date,   23) AS send_date_str,
      CONVERT(VARCHAR(10), o.src_cancel_date, 23) AS cancel_date_str,
      o.order_name,
      o.order_hphone,
      w.groom_name,
      w.bride_name,
      w.wedd_name,
      w.wedd_place,
      w.wedd_date_str,
      w.ftype,
      fi.Card_Code      AS card_code,
      fi.CardBrand      AS card_brand,
      fi.Card_Div       AS card_div,
      fi.item_count
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
          ${projection},
          @category         AS category,
          fi.CardSet_Price  AS item_amount,
          cs.payment_amount,
          COALESCE(c.feeRate, 0)                                    AS commission_rate,
          FLOOR(cs.payment_amount * COALESCE(c.feeRate, 0) / 100.0) AS commission_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN cat_slice cs ON cs.order_seq = o.order_seq
        OUTER APPLY (
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, sc.CardSet_Price, oi.item_count
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
          ${projection},
          ${firstItemCategoryExpr} AS category,
          fi.CardSet_Price   AS item_amount,
          o.last_total_price AS payment_amount,
          COALESCE(c.feeRate, 0)                                          AS commission_rate,
          FLOOR(o.last_total_price * COALESCE(c.feeRate, 0) / 100.0)      AS commission_amount
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        OUTER APPLY (
          SELECT TOP 1 sc.Card_Code, sc.CardBrand, sc.Card_Div, sc.CardSet_Price, oi.item_count
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

    // ─── Column layout ──────────────────────────────────────────────
    // Operations team's accounting template. 상태 column dropped — every
    // settlement row is 발송완료 by construction (src_send_date IS NOT
    // NULL filter), so the column would be a constant. 정산금액 added
    // immediately right of 수수료 — same SQL expression as the on-screen
    // list so row totals reconcile with the headline.
    const headers = [
      "주문번호", "부서", "제휴사ID", "제휴사", "담당자", "플래너명",
      "추가방법", "주문일", "결제일", "배송일", "취소일",
      "결제방법", "결제정보", "PG결제금액", "결제금액", "공급가액",
      "최종금액", "수수료", "정산금액", "주문자명", "신랑/신부명",
      "상품명", "브랜드", "소비자단가", "수량", "기타",
      "예식일자", "예식장", "예식구분", "비고", "구분", "핸드폰",
    ];

    // Category label specifically for the 구분 column. Matches what the
    // accounting team uses on their template (slightly different from the
    // app's CATEGORY_LABEL which says "청첩장" — here it's "일반청첩장").
    const KUBUN_LABEL: Record<Category, string> = {
      invitation: "일반청첩장",
      thankyou: "답례품",
      goods: "기념굿즈",
    };

    // Payment method classifier. Reads the real PG result fields:
    //   pg_resultinfo  — bank/card name or "간편결제 <provider>"
    //   pg_resultinfo2 — extra context (auth number, simple-pay provider)
    //
    // Live distribution of shipped 2026-04 orders:
    //   신용카드          1559   (NH농협카드 / KB국민카드 / VISA …)
    //   간편결제          1416   (간편결제 네이버페이 / 카카오페이 …)
    //   가상계좌           602   (은행 + 계좌번호 + 입금자명)
    //   실시간계좌이체     229   (은행 only, no account)
    //
    // Heuristics — checked against the bar_shop1 distribution; ordering
    // matters (간편결제 wins over 카드 because a card number is often the
    // funding source for a simple-pay).
    function classifyPayment(
      info: string | null,
      info2: string | null
    ): { method: string; detail: string } {
      const a = (info ?? "").trim();
      const b = (info2 ?? "").trim();
      const detail = [a, b].filter(Boolean).join(" ").trim();
      const both = `${a} ${b}`;

      if (
        a.startsWith("간편결제") ||
        /(?:네이버페이|카카오페이|토스페이|페이코|SSGPAY|애플페이|삼성페이|LPAY|KPAY)/.test(both)
      ) {
        return { method: "간편결제", detail };
      }
      if (/카드/.test(a) || /^(?:VISA|MASTER|AMEX|JCB)/i.test(a)) {
        return { method: "신용카드", detail };
      }
      // Bank-rail families.
      if (/(?:은행|뱅크|신협|새마을금고|우체국)/.test(a)) {
        // 가상계좌: long account number AND a Korean depositor name in
        // pg_resultinfo (e.g. "iM뱅크 9600804499517 권민희"). Plain bank
        // name only ("KB국민은행") = 실시간계좌이체.
        if (/\d{10,}/.test(a) && /[가-힣]+\s*$/.test(a)) {
          return { method: "가상계좌", detail };
        }
        return { method: "실시간계좌이체", detail };
      }
      return { method: detail ? "기타" : "", detail };
    }

    function additionMethod(flag: string | null): string {
      const v = (flag ?? "").trim().toUpperCase();
      // order_add_flag 'Y' is observed on follow-on (추가) orders.
      return v === "Y" ? "추가주문" : "";
    }

    const rows = result.recordset.map((r) => {
      const couple = [r.groom_name, r.bride_name]
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join(",");
      const { method: 결제방법, detail: 결제정보 } = classifyPayment(
        r.pg_resultinfo,
        r.pg_resultinfo2
      );
      const lastTotal = Number(r.payment_amount ?? 0);
      const ratePct = Number(r.commission_rate ?? 0);
      const commission = Number(r.commission_amount ?? 0);
      const itemUnit = Number(r.item_amount ?? 0);
      const itemCnt = Number(r.item_count ?? 0);

      return [
        String(r.order_seq),                          // 주문번호
        r.erp_part_code ?? "",                        // 부서
        r.login_id ?? "",                             // 제휴사ID
        r.company_name ?? "",                         // 제휴사
        r.mng_nm ?? "",                               // 담당자
        (r.planner_name ?? "").trim(),                // 플래너명
        additionMethod(r.order_add_flag),             // 추가방법
        r.order_date_str ?? "",                       // 주문일
        r.order_date_str ?? "",                       // 결제일 (instant PG = 주문일)
        r.send_date_str ?? "",                        // 배송일
        r.cancel_date_str ?? "",                      // 취소일
        결제방법,                                     // 결제방법
        결제정보,                                     // 결제정보
        String(lastTotal),                            // PG결제금액
        String(lastTotal),                            // 결제금액
        String(Number(r.supply_amount ?? 0)),         // 공급가액 (자체 처리 = last/1.1, 외주 = 0)
        String(lastTotal),                            // 최종금액
        `${ratePct}%`,                                // 수수료
        String(commission),                           // 정산금액 (= 결제금액 × 수수료율)
        r.order_name ?? "",                           // 주문자명
        couple,                                       // 신랑/신부명
        r.card_code ?? "",                            // 상품명
        brandName(r.card_brand),                      // 브랜드
        String(itemUnit),                             // 소비자단가
        String(itemCnt),                              // 수량
        "-",                                          // 기타 (스펙 placeholder)
        r.wedd_date_str ?? "",                        // 예식일자
        // 예식장 = wedd_name + " " + wedd_place (e.g., "호텔인터불고 원주 1층 루비홀")
        [r.wedd_name, r.wedd_place]
          .map((x) => (x ?? "").trim())
          .filter(Boolean)
          .join(" "),                                 // 예식장
        (r.ftype ?? "").trim(),                       // 예식구분
        "",                                           // 비고
        KUBUN_LABEL[r.category] ?? "",                // 구분
        r.order_hphone ?? "",                         // 핸드폰
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

    return new NextResponse("﻿" + csvBody, {
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
