"use client";

import { useState, useEffect, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface Order {
  id: number;
  order_no: string;
  order_state: string;
  shipping_state: string;
  printing_state: string;
  total_money: number;
  paid_money: number;
  pay_type: string;
  created_at: string;
  user_name: string;
  item_count: number;
}

interface OrderResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

const ORDER_STATES: Record<string, string> = {
  B: "대기",
  P: "결제완료",
  C: "취소",
  R: "환불",
  D: "완료",
};

const SHIPPING_STATES: Record<string, string> = {
  B: "대기",
  R: "준비중",
  S: "배송중",
  D: "배송완료",
};

const STATE_CLASSES: Record<string, string> = {
  B: "type12",
  P: "type14",
  C: "type11",
  R: "type11",
  D: "type15",
  S: "type13",
};

export default function OrderList({ partnerShopId }: { partnerShopId: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // Search filters
  const [orderNo, setOrderNo] = useState("");
  const [orderState, setOrderState] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      partnerShopId: partnerShopId.toString(),
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (orderNo) params.set("orderNo", orderNo);
    if (orderState) params.set("orderState", orderState);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    try {
      const res = await fetch(`/api/orders?${params}`);
      const data: Partial<OrderResponse> = await res.json().catch(() => ({}));
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
      setOrders([]);
      setTotal(0);
    }
    setLoading(false);
  }, [partnerShopId, page, pageSize, orderNo, orderState, dateFrom, dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  const openDetail = async (order: Order) => {
    setSelectedOrder(order);
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      const data = await res.json();
      setOrderDetail(data);
    } catch {
      setOrderDetail(null);
    }
    setShowModal(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      {/* Search Form */}
      <div className="form_wrap">
        <form onSubmit={handleSearch}>
          <table>
            <tbody>
              <tr>
                <th>주문번호</th>
                <td>
                  <input
                    type="text"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    placeholder="주문번호 입력"
                  />
                </td>
                <th>주문상태</th>
                <td>
                  <select value={orderState} onChange={(e) => setOrderState(e.target.value)}>
                    <option value="">전체</option>
                    {Object.entries(ORDER_STATES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <th>주문일</th>
                <td colSpan={3}>
                  <div className="date_picker">
                    <div className="input_form">
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <span style={{ padding: "0 8px" }}>~</span>
                    <div className="input_form">
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="btn_wrap">
            <button type="submit" className="btn purple2">검색</button>
            <button
              type="button"
              className="btn grey"
              onClick={() => {
                setOrderNo("");
                setOrderState("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              초기화
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      <div className="form_wrap table_list">
        <div className="btn_wrap">
          <span className="count" style={{ marginRight: "8px" }}>
            총 <span style={{ color: "#f00", fontWeight: 600 }}>{total.toLocaleString()}</span>건
          </span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            <option value={20}>20개씩</option>
            <option value={50}>50개씩</option>
            <option value={100}>100개씩</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>주문번호</th>
              <th>주문자</th>
              <th>상품수</th>
              <th>주문금액</th>
              <th>결제금액</th>
              <th>결제방법</th>
              <th>주문상태</th>
              <th>배송상태</th>
              <th>주문일시</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: "40px", textAlign: "center" }}>로딩 중...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: "40px", textAlign: "center" }}>조회된 주문이 없습니다.</td></tr>
            ) : (
              orders.map((order, idx) => (
                <tr key={order.id}>
                  <td>{total - (page - 1) * pageSize - idx}</td>
                  <td>
                    <a
                      href="#"
                      className="order_num"
                      onClick={(e) => { e.preventDefault(); openDetail(order); }}
                    >
                      {order.order_no}
                    </a>
                  </td>
                  <td>{order.user_name}</td>
                  <td>{order.item_count}</td>
                  <td>{order.total_money?.toLocaleString()}원</td>
                  <td>{order.paid_money?.toLocaleString()}원</td>
                  <td>{order.pay_type || "-"}</td>
                  <td className="state">
                    <span className={STATE_CLASSES[order.order_state] || "type12"}>
                      {ORDER_STATES[order.order_state] || order.order_state}
                    </span>
                  </td>
                  <td className="state">
                    <span className={STATE_CLASSES[order.shipping_state] || "type12"}>
                      {SHIPPING_STATES[order.shipping_state] || order.shipping_state}
                    </span>
                  </td>
                  <td>{order.created_at ? new Date(order.created_at).toLocaleDateString("ko-KR") : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {/* Order Detail Modal */}
      {showModal && (
        <>
          <div className="overlay" style={{ display: "block" }} onClick={() => setShowModal(false)} />
          <div className="modal" style={{ display: "block" }}>
            <div className="title">
              <h2>주문 상세 <span className="num">({selectedOrder?.order_no})</span></h2>
              <button className="close" onClick={() => setShowModal(false)}>
                <span style={{ color: "#fff", fontSize: "20px" }}>✕</span>
              </button>
            </div>
            <div className="contents">
              {orderDetail ? (
                <>
                  <div className="form_wrap">
                    <div className="sub_title"><h4>주문 정보</h4></div>
                    <table>
                      <tbody>
                        <tr>
                          <th>주문번호</th>
                          <td>{orderDetail.order?.order_no}</td>
                          <th>주문일시</th>
                          <td>{orderDetail.order?.created_at ? new Date(orderDetail.order.created_at).toLocaleString("ko-KR") : "-"}</td>
                        </tr>
                        <tr>
                          <th>주문상태</th>
                          <td>{ORDER_STATES[orderDetail.order?.order_state] || orderDetail.order?.order_state}</td>
                          <th>배송상태</th>
                          <td>{SHIPPING_STATES[orderDetail.order?.shipping_state] || orderDetail.order?.shipping_state}</td>
                        </tr>
                        <tr>
                          <th>주문금액</th>
                          <td>{orderDetail.order?.total_money?.toLocaleString()}원</td>
                          <th>결제금액</th>
                          <td>{orderDetail.order?.paid_money?.toLocaleString()}원</td>
                        </tr>
                        <tr>
                          <th>배송비</th>
                          <td>{orderDetail.order?.delivery_price?.toLocaleString()}원</td>
                          <th>할인금액</th>
                          <td>{orderDetail.order?.discount_money?.toLocaleString()}원</td>
                        </tr>
                        {orderDetail.order?.shipping_company && (
                          <tr>
                            <th>택배사</th>
                            <td>{orderDetail.order.shipping_company}</td>
                            <th>운송장번호</th>
                            <td>{orderDetail.order.shipping_number || "-"}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {orderDetail.items && orderDetail.items.length > 0 && (
                    <div className="form_wrap table_list" style={{ marginTop: "16px" }}>
                      <div className="sub_title"><h4>주문 상품</h4></div>
                      <table>
                        <thead>
                          <tr>
                            <th>상품코드</th>
                            <th>상품명</th>
                            <th>수량</th>
                            <th>금액</th>
                            <th>인쇄상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderDetail.items.map((item: any) => (
                            <tr key={item.id}>
                              <td>{item.product_code}</td>
                              <td style={{ textAlign: "left", paddingLeft: "16px" }}>{item.product_name}</td>
                              <td>{item.qty}</td>
                              <td>{item.total_money?.toLocaleString()}원</td>
                              <td className="state">
                                <span className={STATE_CLASSES[item.printing_state] || "type12"}>
                                  {item.printing_state === "D" ? "완료" : item.printing_state === "P" ? "인쇄중" : "대기"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ textAlign: "center", padding: "40px" }}>로딩 중...</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
