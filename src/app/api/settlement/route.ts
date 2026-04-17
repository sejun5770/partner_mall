import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2";

/**
 * GET /api/settlement
 *
 * Query params:
 *   - page, pageSize                          : pagination (default 1 / 20)
 *   - month=YYYY-MM                           : month filter (takes precedence over dateFrom/dateTo)
 *   - dateFrom=YYYY-MM-DD, dateTo=YYYY-MM-DD  : date-range filter
 *   - partnerShopId                           : admin-only; filter to one partner
 *
 * Authorization:
 *   - Non-admin users see only their own partnerShopId (token-derived).
 *   - Admins see all partners by default, or a single partner if partnerShopId is passed.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
  const month = searchParams.get("month"); // YYYY-MM
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  // Resolve which partner_shop to filter by.
  // Non-admin: always forced to own partnerShopId (ignore query).
  // Admin: optional partnerShopId (empty = all partners).
  let filterPartnerShopId: number | null;
  if (user.isAdmin) {
    const q = searchParams.get("partnerShopId");
    filterPartnerShopId = q ? parseInt(q) : null;
  } else {
    filterPartnerShopId = user.partnerShopId;
  }

  try {
    const pool = getMysqlPool();

    const conds: string[] = ["o.order_state IN ('P', 'D')"];
    const params: (string | number)[] = [];

    if (filterPartnerShopId !== null) {
      conds.push("o.partner_shop_id = ?");
      params.push(filterPartnerShopId);
    }

    // Month filter takes precedence over dateFrom/dateTo.
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const startStr = `${y}-${String(m).padStart(2, "0")}-01 00:00:00`;
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const endStr = `${nextY}-${String(nextM).padStart(2, "0")}-01 00:00:00`;
      conds.push("o.created_at >= ?");
      params.push(startStr);
      conds.push("o.created_at < ?");
      params.push(endStr);
    } else {
      if (dateFrom) {
        conds.push("o.created_at >= ?");
        params.push(`${dateFrom} 00:00:00`);
      }
      if (dateTo) {
        conds.push("o.created_at <= ?");
        params.push(`${dateTo} 23:59:59`);
      }
    }

    const whereClause = "WHERE " + conds.join(" AND ");

    // Summary
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(o.total_money), 0) as total_sales,
        COALESCE(SUM(FLOOR(o.total_money * ps.commission_rate / 100)), 0) as total_commission,
        COALESCE(SUM(o.total_money - FLOOR(o.total_money * ps.commission_rate / 100)), 0) as total_settlement
       FROM orders o
       JOIN partner_shop ps ON o.partner_shop_id = ps.id
       ${whereClause}`,
      params
    );

    // Count
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM orders o
       JOIN partner_shop ps ON o.partner_shop_id = ps.id
       ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // List
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.order_no, o.created_at as order_date,
              o.total_money, o.order_state,
              o.partner_shop_id,
              ps.partner_name,
              ps.commission_rate,
              FLOOR(o.total_money * ps.commission_rate / 100) as commission_amount,
              (o.total_money - FLOOR(o.total_money * ps.commission_rate / 100)) as settlement_amount,
              (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id LIMIT 1) as product_name
       FROM orders o
       JOIN partner_shop ps ON o.partner_shop_id = ps.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return NextResponse.json({
      settlements: rows,
      summary: summaryRows[0],
      total,
      page,
      pageSize,
      isAdmin: user.isAdmin,
      filterPartnerShopId,
    });
  } catch (error) {
    console.error("Settlement fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
