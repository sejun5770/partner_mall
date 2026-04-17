import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const partnerShopId = searchParams.get("partnerShopId");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const orderNo = searchParams.get("orderNo");
  const orderState = searchParams.get("orderState");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!partnerShopId) {
    return NextResponse.json({ message: "partnerShopId required" }, { status: 400 });
  }

  try {
    const pool = getMysqlPool();

    let whereClause = "WHERE o.partner_shop_id = ?";
    const params: (string | number)[] = [parseInt(partnerShopId)];

    if (orderNo) {
      whereClause += " AND o.order_no LIKE ?";
      params.push(`%${orderNo}%`);
    }
    if (orderState) {
      whereClause += " AND o.order_state = ?";
      params.push(orderState);
    }
    if (dateFrom) {
      whereClause += " AND o.created_at >= ?";
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += " AND o.created_at <= ?";
      params.push(`${dateTo} 23:59:59`);
    }

    // Count
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // Data
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.order_no, o.order_state, o.shipping_state,
              o.printing_state, o.total_money, o.paid_money, o.pay_type,
              o.created_at,
              u.name as user_name,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return NextResponse.json({
      orders: rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Orders fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
