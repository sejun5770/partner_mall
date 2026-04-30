import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser, specialRoleOf } from "@/lib/auth";

/**
 * GET /api/marketing/consent?month=YYYY-MM
 *
 * Daily marketing-consent statistics for the 까사미아 (casamia) partner.
 * Each row = one transmission day; columns split by channel (PC vs 모초)
 * and by membership status (신규 가입 vs 기존 회원).
 *
 * Source table: CASAMIA_DAILY_INFO. Each record represents one user
 * record sent to 까사미아. The aggregation here groups by the send date
 * (casamia_send_date, KST) and pivots barun_reg_site:
 *   B / BM / SS / ST / GS / NULL → PC (legacy 바른손몰 PC + 미상)
 *   SB                            → 모초 (모바일 초대장)
 * 신규 vs 기존 distinction:
 *   신규 가입 = barun_reg_Date and casamia_send_date are within the same
 *               KST day (the user signed up at Barunson and was sent on
 *               the same day's nightly batch)
 *   기존 회원 = barun_reg_Date is older than the send day's date
 *
 * Auth: only the casamia_mkt special-role account or admins may read.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  if (specialRoleOf(user) !== "casamia_mkt" && !user.isAdmin) {
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
    const result = await pool
      .request()
      .input("startDate", sql.Date, startDate)
      .input("endDateExcl", sql.Date, endDateExcl)
      .query<{
        send_day: string;
        signup_pc: number;
        signup_mobile: number;
        existing_pc: number;
        existing_mobile: number;
      }>(`
        SELECT
          CONVERT(VARCHAR(10), casamia_send_date, 23) AS send_day,
          SUM(CASE
                WHEN ISNULL(barun_reg_site, '') = 'SB' THEN 0
                WHEN CAST(barun_reg_Date AS DATE) = CAST(casamia_send_date AS DATE) THEN 1
                ELSE 0
              END) AS signup_pc,
          SUM(CASE
                WHEN ISNULL(barun_reg_site, '') = 'SB'
                  AND CAST(barun_reg_Date AS DATE) = CAST(casamia_send_date AS DATE) THEN 1
                ELSE 0
              END) AS signup_mobile,
          SUM(CASE
                WHEN ISNULL(barun_reg_site, '') = 'SB' THEN 0
                WHEN CAST(barun_reg_Date AS DATE) <> CAST(casamia_send_date AS DATE) THEN 1
                ELSE 0
              END) AS existing_pc,
          SUM(CASE
                WHEN ISNULL(barun_reg_site, '') = 'SB'
                  AND CAST(barun_reg_Date AS DATE) <> CAST(casamia_send_date AS DATE) THEN 1
                ELSE 0
              END) AS existing_mobile
        FROM CASAMIA_DAILY_INFO
        WHERE casamia_send_date >= @startDate
          AND casamia_send_date <  @endDateExcl
        GROUP BY CONVERT(VARCHAR(10), casamia_send_date, 23)
        ORDER BY send_day DESC
      `);

    const rows = result.recordset.map((r) => ({
      send_day: r.send_day,
      signup_pc: Number(r.signup_pc ?? 0),
      signup_mobile: Number(r.signup_mobile ?? 0),
      existing_pc: Number(r.existing_pc ?? 0),
      existing_mobile: Number(r.existing_mobile ?? 0),
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        signup_pc: acc.signup_pc + r.signup_pc,
        signup_mobile: acc.signup_mobile + r.signup_mobile,
        existing_pc: acc.existing_pc + r.existing_pc,
        existing_mobile: acc.existing_mobile + r.existing_mobile,
      }),
      { signup_pc: 0, signup_mobile: 0, existing_pc: 0, existing_mobile: 0 },
    );

    return NextResponse.json({ month: startDate.slice(0, 7), rows, totals });
  } catch (error) {
    console.error("Marketing consent stats fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
