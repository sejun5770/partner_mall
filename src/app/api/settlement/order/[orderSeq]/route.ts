import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { classifyCard, Category } from "@/lib/category";

/**
 * GET /api/settlement/order/:orderSeq
 *
 * Returns the data the modal needs to mirror the production portal's
 * order detail view (주문상품 / 결제정보 / 주문금액 / 처리정보 / 주문자
 * / E-Mail / 연락처 / 기타 전달사항).
 *
 * Optional `?category=invitation|thankyou|goods` slices the modal to
 * the same view the active settlement tab is on:
 *   invitation → 상품합계 / 최종금액 = invitation slice
 *                (last_total_price - thankyou_items - goods_items),
 *                items list is filtered to invitation items only.
 *   thankyou   → 상품합계 / 최종금액 = SUM of thankyou items only.
 *   goods      → 상품합계 / 최종금액 = SUM of goods items only.
 * Without `category` (전체 탭), the full order is returned.
 *
 * Auth: admins can fetch any order; non-admin partners can only fetch
 * orders that belong to their own COMPANY_SEQ. Non-admin requests are
 * forced to category=invitation regardless of the query string, mirroring
 * the list endpoint's behavior.
 */
export async function GET(
  request: NextRequest,
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

  const { searchParams } = new URL(request.url);
  const rawCat = searchParams.get("category");
  const requestedCategory: Category | null =
    rawCat === "invitation" || rawCat === "thankyou" || rawCat === "goods"
      ? rawCat
      : null;
  const category: Category | null = user.isAdmin
    ? requestedCategory
    : "invitation";

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
          CONVERT(VARCHAR(19), o.src_cancel_date,   120) AS cancel_date_str
        FROM custom_order o
        JOIN COMPANY c ON c.COMPANY_SEQ = o.company_seq
        WHERE o.order_seq = @orderSeq
      `);

    const order = orderResult.recordset[0];
    if (!order) {
      return NextResponse.json({ message: "not found" }, { status: 404 });
    }

    if (!user.isAdmin && order.company_seq !== user.partnerShopId) {
      return NextResponse.json({ message: "forbidden" }, { status: 403 });
    }

    const itemsResult = await pool
      .request()
      .input("orderSeq", sql.Int, orderSeq)
      .query<{
        Card_Code: string | null;
        Card_Name: string | null;
        Card_Div: string | null;
        item_count: number | null;
        item_sale_price: number | null;
      }>(`
        SELECT
          sc.Card_Code,
          sc.Card_Name,
          sc.Card_Div,
          oi.item_count,
          oi.item_sale_price
        FROM custom_order_item oi
        JOIN S2_Card sc ON sc.Card_Seq = oi.card_seq
        WHERE oi.order_seq = @orderSeq
        ORDER BY oi.id
      `);

    // Tag every item with its category and compute per-category subtotals.
    const taggedItems = itemsResult.recordset.map((r) => {
      const cat = classifyCard(r.Card_Div, r.Card_Code);
      const amount = Number(r.item_sale_price ?? 0) * Number(r.item_count ?? 0);
      return {
        card_code: r.Card_Code ?? "",
        card_name: r.Card_Name ?? "",
        card_div: r.Card_Div ?? "",
        category: cat,
        count: Number(r.item_count ?? 0),
        unit_price: Number(r.item_sale_price ?? 0),
        amount,
      };
    });

    const totals = { invitation: 0, thankyou: 0, goods: 0 };
    for (const it of taggedItems) totals[it.category] += it.amount;

    const lastTotalPrice = Number(order.last_total_price ?? 0);
    const fullItemTotal = totals.invitation + totals.thankyou + totals.goods;

    // Slice based on category tab. Mirrors the slicing in /api/settlement.
    let displayItems = taggedItems;
    let displayItemTotal = fullItemTotal;
    let displayPayment = lastTotalPrice;

    if (category === "invitation") {
      displayItems = taggedItems.filter((it) => it.category === "invitation");
      displayItemTotal = totals.invitation;
      displayPayment = lastTotalPrice - totals.thankyou - totals.goods;
    } else if (category === "thankyou") {
      displayItems = taggedItems.filter((it) => it.category === "thankyou");
      displayItemTotal = totals.thankyou;
      displayPayment = totals.thankyou;
    } else if (category === "goods") {
      displayItems = taggedItems.filter((it) => it.category === "goods");
      displayItemTotal = totals.goods;
      displayPayment = totals.goods;
    }

    // For non-admin partners we mask the order-level totals: a partner is
    // only entitled to see their own (청첩장) slice, not the order's full
    // amounts which would leak the goods / 답례품 numbers handled by other
    // partners (or by Barunson directly). Equating full_* to the slice
    // values means the modal's optional sub-lines render as no-ops.
    const exposeFull = user.isAdmin;
    const fullLastTotalForClient = exposeFull ? lastTotalPrice : displayPayment;
    const fullItemTotalForClient = exposeFull ? fullItemTotal : displayItemTotal;
    const breakdownForClient = exposeFull
      ? {
          invitation: totals.invitation,
          thankyou: totals.thankyou,
          goods: totals.goods,
        }
      : {
          // Partner only sees their own slice.
          invitation: totals.invitation,
          thankyou: 0,
          goods: 0,
        };

    return NextResponse.json({
      order_seq: order.order_seq,
      company_seq: order.company_seq,
      login_id: order.login_id,
      company_name: order.company_name,
      category,

      orderer: {
        name: order.order_name ?? "",
        member_id: order.member_id ?? "",
        email: order.order_email ?? "",
        phone: order.order_phone ?? "",
        hphone: order.order_hphone ?? "",
      },

      payment: {
        pay_type: order.pay_Type ?? "",
        // pg_amount and last_total_price reflect the SLICE in category mode
        // so the modal mirrors the tab's perspective. full_* is the order's
        // untouched total, only exposed to admins.
        pg_amount: displayPayment,
        last_total_price: displayPayment,
        item_total: displayItemTotal,
        order_total_price: Number(order.order_total_price ?? 0),
        full_last_total_price: fullLastTotalForClient,
        full_item_total: fullItemTotalForClient,
        category_breakdown: breakdownForClient,
      },

      dates: {
        order_at: order.order_date_str,
        ap_at: order.ap_date_str,
        compose_at: order.compose_date_str,
        confirm_at: order.confirm_date_str,
        print_at: order.print_date_str,
        send_at: order.send_date_str,
        cancel_at: order.cancel_date_str,
      },

      etc_comment: order.order_etc_comment ?? "",

      items: displayItems,
    });
  } catch (error) {
    console.error("Order detail fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
