"use client";

import { useState, useEffect, useCallback } from "react";
import Pagination from "@/components/Pagination";
import type { Category } from "@/lib/category";
import { CATEGORY_LABEL } from "@/lib/category";
import OrderDetailModal from "./OrderDetailModal";

interface Settlement {
  order_seq: number;
  company_seq: number;
  login_id: string;
  company_name: string;
  // Pre-formatted YYYY-MM-DD strings from the server so timezone shifts
  // don't bump dates by a day in the browser.
  order_date: string | null;
  pay_date: string | null;
  send_date: string | null;
  order_name: string | null;
  couple: string | null;
  wedd_name: string | null;
  planner_name: string | null;
  card_code: string;
  card_brand: string;
  card_div: string | null;
  category: Category;
  item_amount: number;
  payment_amount: number;
  commission_rate: number;
  commission_amount: number;
}

interface CategoryStat {
  orders: number;
  sales: number;
}

interface SettlementSummary {
  total_orders: number;
  total_sales: number;
  total_commission_paid: number;
  by_category?: {
    invitation: CategoryStat;
    thankyou: CategoryStat;
    goods: CategoryStat;
  };
}

interface SettlementResponse {
  settlements: Settlement[];
  summary: SettlementSummary;
  total: number;
  page: number;
  pageSize: number;
}

interface PartnerOption {
  id: number;
  login_id: string;
  partner_name: string;
}

type FilterMode = "month" | "range";
type CategoryTab = "all" | Category;

const DASH = "-";

function fmtMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CATEGORY_BADGE_CLASS: Record<Category, string> = {
  invitation: "bg-indigo-100 text-indigo-800",
  thankyou: "bg-emerald-100 text-emerald-800",
  goods: "bg-amber-100 text-amber-800",
};

export default function SettlementList({ isAdmin }: { isAdmin: boolean }) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  // Period basis: "order" = 주문일, "send" = 배송일. Defaults to 주문일 to
  // match the production portal's PG aggregate.
  const [dateBasis, setDateBasis] = useState<"order" | "send">("order");
  const [month, setMonth] = useState(() => fmtMonth(new Date()));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Non-admin partners only see 청첩장; admins start on "전체".
  const [categoryTab, setCategoryTab] = useState<CategoryTab>(isAdmin ? "all" : "invitation");

  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [partnerNameSearch, setPartnerNameSearch] = useState<string>("");

  // Order-detail modal state
  const [openOrderSeq, setOpenOrderSeq] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/settlement/partners")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { partners: PartnerOption[] }) => setPartners(data.partners ?? []))
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
    if (isAdmin && selectedPartnerId) params.set("partnerShopId", selectedPartnerId);
    if (isAdmin && partnerNameSearch) params.set("partnerName", partnerNameSearch);
    if (categoryTab !== "all") params.set("category", categoryTab);
    params.set("dateBasis", dateBasis);

    try {
      const res = await fetch(`/api/settlement?${params}`);
      const data: Partial<SettlementResponse> = await res.json().catch(() => ({}));
      setSettlements(data.settlements ?? []);
      setSummary(data.summary ?? null);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
      setSettlements([]);
      setSummary(null);
      setTotal(0);
    }
    setLoading(false);
  }, [
    page,
    pageSize,
    filterMode,
    month,
    dateFrom,
    dateTo,
    isAdmin,
    selectedPartnerId,
    partnerNameSearch,
    categoryTab,
    dateBasis,
  ]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  // Excel (CSV) download of the current filter set. Uses the same query
  // params as the list fetch so what the user sees on screen is what they
  // get in the file.
  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterMode === "month" && month) params.set("month", month);
    else if (filterMode === "range") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    if (isAdmin && selectedPartnerId) params.set("partnerShopId", selectedPartnerId);
    if (isAdmin && partnerNameSearch) params.set("partnerName", partnerNameSearch);
    if (categoryTab !== "all") params.set("category", categoryTab);
    params.set("dateBasis", dateBasis);
    window.location.href = `/api/settlement/export?${params}`;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSettlements();
  };

  const handleReset = () => {
    setFilterMode("month");
    setMonth(fmtMonth(new Date()));
    setDateFrom("");
    setDateTo("");
    setSelectedPartnerId("");
    setPartnerNameSearch("");
    setCategoryTab(isAdmin ? "all" : "invitation");
    setDateBasis("order");
    setPage(1);
  };

  const setPrevMonth = () => {
    setFilterMode("month");
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    setMonth(fmtMonth(d));
    setPage(1);
  };
  const setCurrMonth = () => {
    setFilterMode("month");
    setMonth(fmtMonth(new Date()));
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);
  const showPartnerCols = isAdmin && !selectedPartnerId;
  // Category column ("분류") is admin-only; non-admin partners are locked
  // to the 청첩장 category and the column would always say "청첩장".
  const showCategoryCol = isAdmin;
  // columns: NO, [아이디, 제휴사명], 주문번호, [분류], 주문상태, 주문일, 결제일, 배송일,
  //          주문자, 신랑신부, 예식장, 플래너명, 주문카드, 브랜드, 소비자가격, 공급가액, 결제금액, 수수료
  const colCount = (showPartnerCols ? 2 : 0) + (showCategoryCol ? 1 : 0) + 15;

  const byCat = summary?.by_category;
  const tabs: { key: CategoryTab; label: string; count?: number }[] = [
    { key: "all", label: "전체", count: summary?.total_orders },
    { key: "invitation", label: CATEGORY_LABEL.invitation, count: byCat?.invitation.orders },
    { key: "thankyou", label: CATEGORY_LABEL.thankyou, count: byCat?.thankyou.orders },
    { key: "goods", label: CATEGORY_LABEL.goods, count: byCat?.goods.orders },
  ];

  return (
    <div className="space-y-6">
      {/* Filter */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSearch} className="space-y-4">
          {isAdmin && (
            <div className="flex items-center gap-3">
              <label className="w-24 text-sm font-medium text-slate-700">제휴사</label>
              <select
                value={selectedPartnerId}
                onChange={(e) => {
                  setSelectedPartnerId(e.target.value);
                  setPage(1);
                }}
                className="h-9 min-w-64 rounded border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="">전체</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partner_name} ({p.login_id})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={partnerNameSearch}
                onChange={(e) => setPartnerNameSearch(e.target.value)}
                placeholder="제휴사명 검색 (부분일치)"
                className="h-9 w-64 rounded border border-slate-300 bg-white px-2 text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="w-24 text-sm font-medium text-slate-700">기준일</label>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="dateBasis"
                  checked={dateBasis === "order"}
                  onChange={() => {
                    setDateBasis("order");
                    setPage(1);
                  }}
                />
                주문일
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="dateBasis"
                  checked={dateBasis === "send"}
                  onChange={() => {
                    setDateBasis("send");
                    setPage(1);
                  }}
                />
                배송일
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-24 text-sm font-medium text-slate-700">조회 구분</label>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="filterMode"
                  checked={filterMode === "month"}
                  onChange={() => setFilterMode("month")}
                />
                월 단위
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="filterMode"
                  checked={filterMode === "range"}
                  onChange={() => setFilterMode("range")}
                />
                기간 지정
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-24 text-sm font-medium text-slate-700">
              {filterMode === "month" ? "정산월" : "기간"}
            </label>
            {filterMode === "month" ? (
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 rounded border border-slate-300 bg-white px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={setPrevMonth}
                  className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  전월
                </button>
                <button
                  type="button"
                  onClick={setCurrMonth}
                  className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  당월
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 rounded border border-slate-300 bg-white px-2 text-sm"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 rounded border border-slate-300 bg-white px-2 text-sm"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="h-9 rounded bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              검색
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="h-9 rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              초기화
            </button>
          </div>
        </form>
      </section>

      {/* Per-category summary — admin only. Non-admin partners only see
          the 청첩장 category, so the 3-up breakdown would just be
          invitation-plus-two-zeros. */}
      {isAdmin && summary && byCat && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <CategoryCard
            label="청첩장"
            orders={byCat.invitation.orders}
            sales={byCat.invitation.sales}
            tone="invitation"
          />
          <CategoryCard
            label="답례품"
            orders={byCat.thankyou.orders}
            sales={byCat.thankyou.sales}
            tone="thankyou"
          />
          <CategoryCard
            label="기념굿즈(데코소품)"
            orders={byCat.goods.orders}
            sales={byCat.goods.sales}
            tone="goods"
          />
        </section>
      )}

      {/* Totals — order-level. 총 결제금액 is SUM(last_total_price), so it
          reflects the actual 결제금액 (includes delivery/jebon/coupon etc.). */}
      {summary && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryCard label="총 주문건수" value={`${summary.total_orders.toLocaleString()} 건`} />
          <SummaryCard label="총 결제금액" value={`${summary.total_sales.toLocaleString()} 원`} />
          <SummaryCard
            label="총 지급 수수료"
            value={`${summary.total_commission_paid.toLocaleString()} 원`}
            tone="negative"
          />
        </section>
      )}

      {/* List */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Category tabs — admin only. Non-admin partners are restricted to
            the 청첩장 category on the server side as well. */}
        {isAdmin && (
          <div role="tablist" className="flex gap-1 border-b border-slate-200 px-3 pt-3">
            {tabs.map((t) => {
              const active = categoryTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setCategoryTab(t.key);
                    setPage(1);
                  }}
                  className={
                    "-mb-px rounded-t border border-b-0 px-4 py-2 text-sm font-medium " +
                    (active
                      ? "border-slate-200 bg-white text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-800")
                  }
                >
                  {t.label}
                  {typeof t.count === "number" && (
                    <span className="ml-1.5 text-xs text-slate-400">{t.count.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <span className="text-sm text-slate-600">
            총 <strong className="text-slate-900">{total.toLocaleString()}</strong>건
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || total === 0}
              className="h-8 rounded bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              엑셀 다운로드
            </button>
            <label className="text-sm text-slate-600">
              표시{" "}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="ml-1 h-8 rounded border border-slate-300 bg-white px-2 text-sm"
              >
                <option value={20}>20개씩</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <Th>NO</Th>
                {showPartnerCols && <Th>아이디</Th>}
                {showPartnerCols && <Th>제휴사명</Th>}
                <Th>주문번호</Th>
                {showCategoryCol && <Th>분류</Th>}
                <Th>주문상태</Th>
                <Th>주문일</Th>
                <Th>결제일</Th>
                <Th>배송일</Th>
                <Th>주문자</Th>
                <Th>신랑,신부</Th>
                <Th>예식장</Th>
                <Th>플래너명</Th>
                <Th>주문카드</Th>
                <Th>브랜드</Th>
                <Th align="right">소비자가격</Th>
                <Th align="right">공급가액</Th>
                <Th align="right">결제금액</Th>
                <Th align="right">수수료</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-slate-500">
                    로딩 중...
                  </td>
                </tr>
              ) : settlements.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-slate-500">
                    조회된 정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                settlements.map((s, idx) => {
                  // Dates come pre-formatted YYYY-MM-DD from the server — display as-is
                  // to avoid JS Date timezone conversion (browser's local TZ shifted
                  // shipments one day forward).
                  return (
                    <tr key={s.order_seq} className="hover:bg-slate-50">
                      <Td>{total - (page - 1) * pageSize - idx}</Td>
                      {showPartnerCols && <Td>{s.login_id}</Td>}
                      {showPartnerCols && <Td>{s.company_name}</Td>}
                      <Td>
                        <button
                          type="button"
                          onClick={() => setOpenOrderSeq(s.order_seq)}
                          className="font-medium text-indigo-600 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded"
                        >
                          {s.order_seq}
                        </button>
                      </Td>
                      {showCategoryCol && (
                        <Td>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE_CLASS[s.category]}`}
                          >
                            {CATEGORY_LABEL[s.category]}
                          </span>
                        </Td>
                      )}
                      <Td>
                        <span className="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                          발송완료
                        </span>
                      </Td>
                      <Td>{s.order_date || DASH}</Td>
                      <Td>{s.pay_date || DASH}</Td>
                      <Td>{s.send_date || DASH}</Td>
                      <Td>{s.order_name || DASH}</Td>
                      <Td>{s.couple || DASH}</Td>
                      <Td>{s.wedd_name || DASH}</Td>
                      <Td>{s.planner_name || DASH}</Td>
                      <Td>{s.card_code}</Td>
                      <Td>{s.card_brand}</Td>
                      <Td align="right">{s.item_amount.toLocaleString()}</Td>
                      <Td align="right">{DASH}</Td>
                      <Td align="right">{s.payment_amount.toLocaleString()}</Td>
                      <Td align="right">{s.commission_rate}%</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-5 py-3">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </section>

      {openOrderSeq != null && (
        <OrderDetailModal
          orderSeq={openOrderSeq}
          // Slice the modal to the active tab — clicking an order in the
          // 청첩장 tab shows only the invitation slice; 전체 tab passes
          // null and shows the full order.
          category={categoryTab === "all" ? null : categoryTab}
          onClose={() => setOpenOrderSeq(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const valueColor =
    tone === "negative" ? "text-rose-600" : tone === "positive" ? "text-indigo-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

function CategoryCard({
  label,
  orders,
  sales,
  tone,
}: {
  label: string;
  orders: number;
  sales: number;
  tone: Category;
}) {
  const accent: Record<Category, string> = {
    invitation: "border-l-indigo-500",
    thankyou: "border-l-emerald-500",
    goods: "border-l-amber-500",
  };
  return (
    <div
      className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${accent[tone]}`}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-bold text-slate-900">{orders.toLocaleString()}</span>
        <span className="text-xs text-slate-500">건</span>
      </div>
      <div className="mt-0.5 text-sm text-slate-600">{sales.toLocaleString()} 원</div>
    </div>
  );
}

function Th({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
}) {
  const alignCls = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <th scope="col" className={`whitespace-nowrap px-2 py-2.5 text-[11px] font-semibold ${alignCls}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "center",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const alignCls = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return <td className={`whitespace-nowrap px-2 py-2 ${alignCls} ${className}`}>{children}</td>;
}
