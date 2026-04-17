"use client";

import { useState, useEffect, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface Settlement {
  id: number;
  order_no: string;
  order_date: string;
  total_money: number;
  commission_rate: number;
  commission_amount: number;
  settlement_amount: number;
  order_state: string;
  product_name: string | null;
  partner_shop_id: number;
  partner_name: string;
}

interface SettlementSummary {
  total_orders: number;
  total_sales: number;
  total_commission: number;
  total_settlement: number;
}

interface SettlementResponse {
  settlements: Settlement[];
  summary: SettlementSummary;
  total: number;
  page: number;
  pageSize: number;
  isAdmin: boolean;
  filterPartnerShopId: number | null;
}

interface PartnerOption {
  id: number;
  partner_name: string;
}

type FilterMode = "month" | "range";

export default function SettlementList({ isAdmin }: { isAdmin: boolean }) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  // Load partner list (admin only).
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/settlement/partners")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { partners: PartnerOption[] }) => setPartners(data.partners))
      .catch((err) => console.error("partner list error", err));
  }, [isAdmin]);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (filterMode === "month" && month) {
      params.set("month", month);
    } else if (filterMode === "range") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    if (isAdmin && selectedPartnerId) {
      params.set("partnerShopId", selectedPartnerId);
    }

    try {
      const res = await fetch(`/api/settlement?${params}`);
      const data: SettlementResponse = await res.json();
      setSettlements(data.settlements ?? []);
      setSummary(data.summary ?? null);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [page, pageSize, filterMode, month, dateFrom, dateTo, isAdmin, selectedPartnerId]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSettlements();
  };

  const handleReset = () => {
    setFilterMode("month");
    const now = new Date();
    setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setDateFrom("");
    setDateTo("");
    setSelectedPartnerId("");
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);
  const showPartnerCol = isAdmin && !selectedPartnerId;
  const colSpan = showPartnerCol ? 10 : 9;

  return (
    <>
      <section aria-label="검색">
        <form onSubmit={handleSearch}>
          {isAdmin && (
            <div>
              <label>
                제휴사{" "}
                <select
                  value={selectedPartnerId}
                  onChange={(e) => {
                    setSelectedPartnerId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">전체</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.partner_name} (#{p.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div>
            <label>
              <input
                type="radio"
                name="filterMode"
                checked={filterMode === "month"}
                onChange={() => setFilterMode("month")}
              />{" "}
              월 단위
            </label>
            <label>
              <input
                type="radio"
                name="filterMode"
                checked={filterMode === "range"}
                onChange={() => setFilterMode("range")}
              />{" "}
              기간 지정
            </label>
          </div>

          {filterMode === "month" ? (
            <div>
              <label>
                정산월{" "}
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div>
              <label>
                시작일{" "}
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label>
                종료일{" "}
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </div>
          )}

          <div>
            <button type="submit">검색</button>
            <button type="button" onClick={handleReset}>초기화</button>
          </div>
        </form>
      </section>

      {summary && (
        <section aria-label="정산 요약">
          <dl>
            <dt>총 주문건수</dt>
            <dd>{summary.total_orders.toLocaleString()} 건</dd>
            <dt>총 매출액</dt>
            <dd>{summary.total_sales.toLocaleString()} 원</dd>
            <dt>총 수수료</dt>
            <dd>{summary.total_commission.toLocaleString()} 원</dd>
            <dt>정산금액</dt>
            <dd>{summary.total_settlement.toLocaleString()} 원</dd>
          </dl>
        </section>
      )}

      <section aria-label="정산 내역">
        <div>
          <span>총 {total.toLocaleString()}건</span>
          <label>
            {" "}표시{" "}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20개씩</option>
              <option value={50}>50개씩</option>
              <option value={100}>100개씩</option>
            </select>
          </label>
        </div>

        <table>
          <thead>
            <tr>
              <th scope="col">No</th>
              {showPartnerCol && <th scope="col">제휴사</th>}
              <th scope="col">주문번호</th>
              <th scope="col">상품명</th>
              <th scope="col">주문일</th>
              <th scope="col">주문금액</th>
              <th scope="col">수수료율</th>
              <th scope="col">수수료</th>
              <th scope="col">정산금액</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan}>로딩 중...</td>
              </tr>
            ) : settlements.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>조회된 정산 내역이 없습니다.</td>
              </tr>
            ) : (
              settlements.map((s, idx) => (
                <tr key={s.id}>
                  <td>{total - (page - 1) * pageSize - idx}</td>
                  {showPartnerCol && <td>{s.partner_name}</td>}
                  <td>{s.order_no}</td>
                  <td>{s.product_name || "-"}</td>
                  <td>{s.order_date ? new Date(s.order_date).toLocaleDateString("ko-KR") : "-"}</td>
                  <td>{s.total_money?.toLocaleString()}원</td>
                  <td>{s.commission_rate}%</td>
                  <td>{s.commission_amount?.toLocaleString()}원</td>
                  <td>{s.settlement_amount?.toLocaleString()}원</td>
                  <td>{s.order_state === "D" ? "정산완료" : "대기"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </section>
    </>
  );
}
