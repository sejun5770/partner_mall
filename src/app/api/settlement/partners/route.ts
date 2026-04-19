import { NextResponse } from "next/server";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/settlement/partners
 * Admin-only. Returns bar_shop1.COMPANY rows for the partner dropdown.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
  }

  try {
    const pool = await getMssqlPool();
    const result = await pool.request().query<{
      company_seq: number;
      login_id: string;
      company_name: string;
    }>(`
      SELECT COMPANY_SEQ AS company_seq,
             LOGIN_ID    AS login_id,
             COMPANY_NAME AS company_name
      FROM COMPANY
      WHERE COMPANY_NAME IS NOT NULL
      ORDER BY COMPANY_NAME ASC
    `);

    return NextResponse.json({
      partners: result.recordset.map((r) => ({
        id: r.company_seq,
        login_id: r.login_id,
        partner_name: r.company_name,
      })),
    });
  } catch (error) {
    console.error("Partner list error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
