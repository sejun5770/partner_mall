import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { categoryCaseSql } from "@/lib/category";

/**
 * GET /api/settlement/monthly?month=YYYY-MM
 *
 * Admin-only summary of monthly settlement amounts grouped by partner
 * (제휴사). Reuses the same business rules as /api/settlement so the
 * monthly headline aligns with what the row-level page produces:
 *   - excluded internal LOGIN_IDs
 *   - trouble_type='0'
 *   - src_send_date IS NOT NULL
 *   - shipped-in-period OR refund-in-period (refund-only offsets included)
 *   - net = last_total_price − refund_after_send (post-shipment, in period)
 *   - commission = FLOOR(net × COMPANY.feeRate / 100) per row, summed
 *
 * Returns one row per partner with totals and a grand total at the bottom.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

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
    startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    endDateExcl = `${ny}-${String(nm).padStart(2, "0")}-01`;
  }

  try {
    const pool = await getMssqlPool();
    const req = pool
      .request()
      .input("startDate", sql.Date, startDate)
      .input("endDateExcl", sql.Date, endDateExcl);

    const itemCategoryExpr = categoryCaseSql("sc.Card_Div", "sc.Card_Code");
    const shippedInPeriodExpr = `(o.src_send_date >= @startDate AND o.src_send_date < @endDateExcl)`;

    // Same shape as /api/settlement order_cats so totals align.
    const result = await req.query<{
      company_seq: number;
      login_id: string;
      company_name: string;
      mng_nm: string | null;
      fee_rate: number | null;
      order_count: number;
      gross_sales: number | null;
      total_refund: number | null;
      net_sales: number | null;
      total_commission: number | null;
      refund_only_count: number;
    }>(`
      WITH order_cats AS (
        SELECT
          o.order_seq,
          o.company_seq,
          MAX(CASE WHEN ${shippedInPeriodExpr} THEN 0 ELSE 1 END) AS is_refund_only,
          MAX(o.last_total_price) AS gross_ltp,
          MAX(ISNULL(rf.refund_after_send, 0)) AS refund_after_send,
          CASE
            WHEN MAX(CASE WHEN ${shippedInPeriodExpr} THEN 1 ELSE 0 END) = 1
              THEN MAX(o.last_total_price) - MAX(ISNULL(rf.refund_after_send, 0))
            ELSE
              -MAX(ISNULL(rf.refund_after_send, 0))
          END AS ltp,
          MAX(CASE WHEN ${itemCategoryExpr} = 'invitation' THEN 1 ELSE 0 END) AS has_inv
        FROM custom_order o
        JOIN COMPANY c ON o.company_seq = c.COMPANY_SEQ
        JOIN custom_order_item oi ON oi.order_seq = o.order_seq
        JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
        LEFT JOIN (
          SELECT r.order_seq, SUM(r.refund_price) AS refund_after_send
          FROM custom_order_refund r
          JOIN custom_order o2 ON o2.order_seq = r.order_seq
          WHERE TRY_CAST(r.refund_date AS DATE) >= CAST(o2.src_send_date AS DATE)
            AND TRY_CAST(r.refund_date AS DATE) >= @startDate
            AND TRY_CAST(r.refund_date AS DATE) <  @endDateExcl
          GROUP BY r.order_seq
        ) rf ON rf.order_seq = o.order_seq
        WHERE o.src_send_date IS NOT NULL
          AND c.LOGIN_ID NOT IN ('s2_barunsoncard', 'deardeer', 's2_storyoflove')
          AND o.trouble_type = '0'
          AND (
            ${shippedInPeriodExpr}
            -- refund-in-period detection: rf is the LEFT JOIN that already
            -- bounds refund_date to the period. Non-NULL means a refund
            -- exists for this order in this period. Avoids SQL Server
            -- optimizer "internal error" we hit with EXISTS + GROUP BY.
            OR rf.refund_after_send > 0
          )
        GROUP BY o.order_seq, o.company_seq
      )
      SELECT
        c.COMPANY_SEQ                        AS company_seq,
        c.LOGIN_ID                           AS login_id,
        c.COMPANY_NAME                       AS company_name,
        c.MNG_NM                             AS mng_nm,
        COALESCE(c.feeRate, 0)               AS fee_rate,
        SUM(CASE WHEN oc.is_refund_only = 0 THEN 1 ELSE 0 END) AS order_count,
        SUM(CASE WHEN oc.is_refund_only = 0 THEN 1 ELSE 0 END) +
          SUM(CASE WHEN oc.is_refund_only = 1 THEN 1 ELSE 0 END) AS row_count,
        SUM(CASE WHEN oc.is_refund_only = 0 THEN oc.gross_ltp ELSE 0 END) AS gross_sales,
        SUM(oc.refund_after_send)            AS total_refund,
        SUM(oc.ltp)                          AS net_sales,
        SUM(FLOOR(oc.ltp * COALESCE(c.feeRate, 0) / 100.0)) AS total_commission,
        SUM(CASE WHEN oc.is_refund_only = 1 THEN 1 ELSE 0 END) AS refund_only_count
      FROM order_cats oc
      JOIN COMPANY c ON c.COMPANY_SEQ = oc.company_seq
      GROUP BY c.COMPANY_SEQ, c.LOGIN_ID, c.COMPANY_NAME, c.MNG_NM, c.feeRate
      ORDER BY total_commission DESC
    `);

    const rows = result.recordset.map((r) => ({
      company_seq: r.company_seq,
      login_id: r.login_id,
      company_name: r.company_name ?? "",
      mng_nm: r.mng_nm ?? "",
      fee_rate: Number(r.fee_rate ?? 0),
      order_count: Number(r.order_count ?? 0),
      gross_sales: Number(r.gross_sales ?? 0),
      total_refund: Number(r.total_refund ?? 0),
      net_sales: Number(r.net_sales ?? 0),
      total_commission: Number(r.total_commission ?? 0),
      refund_only_count: Number(r.refund_only_count ?? 0),
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        order_count: acc.order_count + r.order_count,
        gross_sales: acc.gross_sales + r.gross_sales,
        total_refund: acc.total_refund + r.total_refund,
        net_sales: acc.net_sales + r.net_sales,
        total_commission: acc.total_commission + r.total_commission,
      }),
      {
        order_count: 0,
        gross_sales: 0,
        total_refund: 0,
        net_sales: 0,
        total_commission: 0,
      }
    );

    return NextResponse.json({
      month: startDate.slice(0, 7),
      partners: rows,
      totals,
    });
  } catch (error) {
    console.error("Monthly summary fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
