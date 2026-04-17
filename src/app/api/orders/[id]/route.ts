import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const pool = getMysqlPool();

    const [orderRows] = await pool.query<RowDataPacket[]>(
      `SELECT o.*, u.name as user_name, u.phone as user_phone, u.email as user_email
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [id]
    );

    if (orderRows.length === 0) {
      return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
    }

    const [itemRows] = await pool.query<RowDataPacket[]>(
      `SELECT oi.id, oi.product_code, oi.product_name, oi.qty,
              oi.total_money, oi.printing_state, oi.draft_state
       FROM order_items oi
       WHERE oi.order_id = ?
       ORDER BY oi.id`,
      [id]
    );

    return NextResponse.json({
      order: orderRows[0],
      items: itemRows,
    });
  } catch (error) {
    console.error("Order detail error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
