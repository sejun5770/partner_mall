import { NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2";

/**
 * GET /api/settlement/partners
 * Admin-only. Returns the list of partner_shop rows (id, partner_name)
 * used to populate the admin filter dropdown.
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
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, partner_name
       FROM partner_shop
       ORDER BY partner_name ASC`
    );
    return NextResponse.json({ partners: rows });
  } catch (error) {
    console.error("Partner list error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
