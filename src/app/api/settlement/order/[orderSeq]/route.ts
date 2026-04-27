import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/settlement/order/:orderSeq
 *
 * Returns the data the modal needs to mirror the production portal's
 * order detail view (주문상품 / 결제정보 / 주문금액 / 처리정보 / 주문자
 * / E-Mail / 연락처 / 기타 전달사항).
 *
 * Auth: admins can fetch any order; non-admin partners can only fetch
 * orders that belong to their own COMPANY_SEQ.
 *
 * Date columns in custom_order are smalldatetime — pre-formatted on the
 * server (CONVERT(..., 120) gives "yyyy-MM-dd HH:mm:ss") to avoid the
 * timezone roll-forward we previously hit when the browser re-formatted
 * UTC-assumed Date objects in KST.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ orderSeq: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const { orderSeq: orderSeqStr } = await ctx.params;
  const orderSeq = parseInt(orderSeqStr, 10);
  if (!Number.isFinite(orderSeq) || orderSeq <= 0) {
    return NextResponse.json({ message: "invalid order_seq" }, { status: 400 });
  }

  try {
    const pool = await getMssqlPool();

    const orderResult = await pool
      .request()
      .input("orderSeq", sql.Int, orderSeq)
      .query<{
        order_seq: number;
        company_seq: number;
        login_id: string;
        company_name: string;
        order_name: string | null;
        member_id: string | null;
        order_email: string | null;
        order_phone: string | null;
        order_hphone: string | null;
        order_etc_comment: string | null;
        pay_Type: string | null;
        order_total_price: number | null;
        last_total_price: number | null;
        order_date_str: string | null;
        ap_date_str: string | null;
        compose_date_str: string | null;
        confirm_date_str: string | null;
        print_date_str: string | null;
        send_date_str: string | null;
        cancel_date_str: string | null;
        item_total: number | null;
      }>(`
        SELECT
          o.order_seq,
          o.company_seq,
          c.LOGIN_ID    AS login_id,
          c.COMPANY_NAME AS company_name,
          o.order_name,
          o.member_id,
          o.order_email,
          o.order_phone,
          o.order_hphone,
          o.order_etc_comment,
          o.pay_Type,
          o.order_total_price,
          o.last_total_price,
          CONVERT(VARCHAR(19), o.order_date,        120) AS order_date_str,
          CONVERT(VARCHAR(19), o.src_ap_date,       120) AS ap_date_str,
          CONVERT(VARCHAR(19), o.src_compose_date,  120) AS compose_date_str,
          CONVERT(VARCHAR(19), o.src_confirm_date,  120) AS confirm_date_str,
          CONVERT(VARCHAR(19), o.src_print_date,    120) AS print_date_str,
          CONVERT(VARCHAR(19), o.src_send_date,     120) AS send_date_str,
          CONVERT(VARCHAR(19), o.src_cancel_date,   120) AS cancel_date_str,
          (
            SELECT COALESCE(SUM(oi.item_sale_price * oi.item_count), 0)
            FROM custom_order_item oi
            WHERE oi.order_seq = o.order_seq
          ) AS item_total
        FROM custom_order o
        JOIN COMPANY c ON c.COMPANY_SEQ = o.company_seq
        WHERE o.order_seq = @orderSeq
      `);

    const order = orderResult.recordset[0];
    if (!order) {
      return NextResponse.json({ message: "not found" }, { status: 404 });
    }

    // Non-admin can only see their own company's orders.
    if (!user.isAdmin && order.company_seq !== user.partnerShopId) {
      return NextResponse.json({ message: "forbidden" }, { status: 403 });
    }

    const itemsResult = await pool
      .request()
      .input("orderSeq", sql.Int, orderSeq)
      .query<{
        Card_Code: string | null;
        Card_Name: string | null;
        item_count: number | null;
        item_sale_price: number | null;
      }>(`
        SELECT
          sc.Card_Code,
          sc.Card_Name,
          oi.item_count,
          oi.item_sale_price
        FROM custom_order_item oi
        JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
        WHERE oi.order_seq = @orderSeq
        ORDER BY oi.id
      `);

    return NextResponse.json({
      order_seq: order.order_seq,
      company_seq: order.company_seq,
      login_id: order.login_id,
      company_name: order.company_name,

      orderer: {
        name: order.order_name ?? "",
        member_id: order.member_id ?? "",
        email: order.order_email ?? "",
        phone: order.order_phone ?? "",
        hphone: order.order_hphone ?? "",
      },

      payment: {
        pay_type: order.pay_Type ?? "",
        // PG / 결제 최종 금액 — both come from last_total_price; the live
        // schema doesn't expose a separate PG amount column.
        pg_amount: Number(order.last_total_price ?? 0),
        last_total_price: Number(order.last_total_price ?? 0),
        item_total: Number(order.item_total ?? 0),
        order_total_price: Number(order.order_total_price ?? 0),
      },

      dates: {
        order_at: order.order_date_str,        // 주문일
        ap_at: order.ap_date_str,              // 결제 승인일
        compose_at: order.compose_date_str,    // 초안등록일
        confirm_at: order.confirm_date_str,    // 컨펌일
        print_at: order.print_date_str,        // 인쇄지시일
        send_at: order.send_date_str,          // 배송일
        cancel_at: order.cancel_date_str,      // 주문취소일
      },

      etc_comment: order.order_etc_comment ?? "",

      items: itemsResult.recordset.map((r) => ({
        card_code: r.Card_Code ?? "",
        card_name: r.Card_Name ?? "",
        count: Number(r.item_count ?? 0),
        unit_price: Number(r.item_sale_price ?? 0),
      })),
    });
  } catch (error) {
    console.error("Order detail fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
