import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const partnerShopId = searchParams.get("partnerShopId");
  const userId = searchParams.get("userId");

  if (!partnerShopId || !userId) {
    return NextResponse.json({ message: "partnerShopId and userId required" }, { status: 400 });
  }

  try {
    const pool = getMysqlPool();

    // Partner info
    const [partnerRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, partner_name, commission_rate FROM partner_shop WHERE id = ?",
      [partnerShopId]
    );

    // User info
    const [userRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, user_id, email FROM partner_users WHERE partner_shop_id = ? AND user_id = ? AND deleted_at IS NULL",
      [partnerShopId, userId]
    );

    // Stats
    const [statsRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(*) FROM orders WHERE partner_shop_id = ?) as total_orders,
        (SELECT COALESCE(SUM(total_money), 0) FROM orders WHERE partner_shop_id = ? AND order_state IN ('P', 'D')) as total_sales,
        (SELECT COUNT(*) FROM users WHERE partner_shop_id = ?) as total_users`,
      [partnerShopId, partnerShopId, partnerShopId]
    );

    return NextResponse.json({
      partner: partnerRows[0] || { id: partnerShopId, partner_name: "-", commission_rate: 0 },
      user: userRows[0] || { id: 0, user_id: userId, email: "-" },
      stats: statsRows[0] || { total_orders: 0, total_sales: 0, total_users: 0 },
    });
  } catch (error) {
    console.error("Partner info error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
