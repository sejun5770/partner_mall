"use client";

import { useCallback, useEffect, useState } from "react";

interface PartnerRow {
  company_seq: number;
  login_id: string;
  company_name: string;
  mng_nm: string;
  fee_rate: number;
  order_count: number;
  gross_sales: number;
  total_refund: number;
  net_sales: number;
  total_commission: number;
  refund_only_count: number;
}

interface MonthlyResponse {
  month: string;
  partners: PartnerRow[];
  totals: {
    order_count: number;
    gross_sales: number;
    total_refund: number;
    net_sales: number;
    total_commission: number;
  };
}

type SortKey =
  | "company_name"
  | "fee_rate"
  | "order_count"
  | "gross_sales"
  | "total_refund"
  | "net_sales"
  | "total_commission";

function fmtMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthlyByPartner() {
  const [month, setMonth] = useState(() => fmtMonth(new Date()));
  const [data, setData] = useState<MonthlyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("total_commission");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const fetchMonthly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settlement/monthly?month=${month}`);
      if (!res.ok) throw new Error("fetch failed");
      const body = (await res.json()) as MonthlyResponse;
      setData(body);
    } catch {
      setError("데이터를 불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchMonthly();
  }, [fetchMonthly]);

  const setPrevMonth = () => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() - 1);
    setMonth(fmtMonth(d));
  };
  const setNextMonth = () => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + 1);
    setMonth(fmtMonth(d));
  };
  const setCurrMonth = () => setMonth(fmtMonth(new Date()));

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const partners = (data?.partners ?? []).slice();
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    partners.splice(
      0,
      partners.length,
      ...partners.filter(
        (p) =>
          p.company_name.toLowerCase().includes(q) ||
          p.login_id.toLowerCase().includes(q) ||
          p.mng_nm.toLowerCase().includes(q),
      ),
    );
  }
  partners.sort((a, b) => {
    if (sortKey === "company_name")
      return sortAsc
        ? a.company_name.localeCompare(b.company_name)
        : b.company_name.localeCompare(a.company_name);
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortAsc ? av - bv : bv - av;
  });

  return (
    <div className="space-y-5">
      {/* Filter */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">정산월</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={setPrevMonth}
              aria-label="이전월"
              className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ◀
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-sm"
            />
            <button
              type="button"
              onClick={setNextMonth}
              aria-label="다음월"
              className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={setCurrMonth}
              className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              당월
            </button>
          </div>
          <span className="ml-4 text-sm font-medium text-slate-700">검색</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제휴사명 / 아이디 / 담당자"
            className="h-9 w-64 rounded border border-slate-300 bg-white px-2 text-sm"
          />
        </div>
      </section>

      {/* Totals */}
      {data && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard
            label="대상 업체수"
            value={`${partners.length.toLocaleString()} 곳`}
          />
          <SummaryCard
            label="총 결제금액"
            value={`${data.totals.gross_sales.toLocaleString()} 원`}
            tone="positive"
          />
          <SummaryCard
            label="총 환불금액"
            value={`${data.totals.total_refund.toLocaleString()} 원`}
            tone="negative"
          />
          <SummaryCard
            label="총 정산금액"
            value={`${data.totals.total_commission.toLocaleString()} 원`}
            tone="positive"
          />
        </section>
      )}

      {/* Table */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <span className="text-sm text-slate-600">
            {data ? `${data.month} · ` : ""}
            {partners.length.toLocaleString()}개 업체
          </span>
          <span className="text-xs text-slate-400">
            클릭으로 정렬 (기본: 정산금액 내림차순)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <Th>NO</Th>
                <Th align="left">아이디</Th>
                <Th
                  align="left"
                  sortable
                  active={sortKey === "company_name"}
                  asc={sortAsc}
                  onClick={() => onSort("company_name")}
                >
                  제휴사명
                </Th>
                <Th align="left">담당자</Th>
                <Th
                  align="right"
                  sortable
                  active={sortKey === "fee_rate"}
                  asc={sortAsc}
                  onClick={() => onSort("fee_rate")}
                >
                  수수료율
                </Th>
                <Th
                  align="right"
                  sortable
                  active={sortKey === "order_count"}
                  asc={sortAsc}
                  onClick={() => onSort("order_count")}
                >
                  주문건수
                </Th>
                <Th
                  align="right"
                  sortable
                  active={sortKey === "gross_sales"}
                  asc={sortAsc}
                  onClick={() => onSort("gross_sales")}
                >
                  결제금액
                </Th>
                <Th
                  align="right"
                  sortable
                  active={sortKey === "total_refund"}
                  asc={sortAsc}
                  onClick={() => onSort("total_refund")}
                >
                  환불금액
                </Th>
                <Th
                  align="right"
                  sortable
                  active={sortKey === "net_sales"}
                  asc={sortAsc}
                  onClick={() => onSort("net_sales")}
                >
                  순매출
                </Th>
                <Th
                  align="right"
                  sortable
                  active={sortKey === "total_commission"}
                  asc={sortAsc}
                  onClick={() => onSort("total_commission")}
                >
                  정산금액
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    로딩 중...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-rose-600">
                    {error}
                  </td>
                </tr>
              ) : partners.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    조회된 정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                partners.map((p, idx) => (
                  <tr
                    key={p.company_seq}
                    className={
                      p.total_refund > 0
                        ? "bg-rose-50/30 hover:bg-rose-50"
                        : "hover:bg-slate-50"
                    }
                  >
                    <Td>{idx + 1}</Td>
                    <Td align="left">{p.login_id}</Td>
                    <Td align="left" className="font-medium text-slate-900">
                      {p.company_name}
                    </Td>
                    <Td align="left" className="text-slate-600">
                      {p.mng_nm || "-"}
                    </Td>
                    <Td align="right">{p.fee_rate}%</Td>
                    <Td align="right">{p.order_count.toLocaleString()}</Td>
                    <Td align="right">{p.gross_sales.toLocaleString()}</Td>
                    <Td
                      align="right"
                      className={p.total_refund > 0 ? "text-rose-600" : ""}
                    >
                      {p.total_refund > 0
                        ? `−${p.total_refund.toLocaleString()}`
                        : "-"}
                    </Td>
                    <Td align="right">{p.net_sales.toLocaleString()}</Td>
                    <Td
                      align="right"
                      className={
                        "font-semibold " +
                        (p.total_commission < 0
                          ? "text-rose-600"
                          : "text-emerald-700")
                      }
                    >
                      {p.total_commission.toLocaleString()}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {partners.length > 0 && data && (
              <tfoot className="bg-slate-100 font-semibold text-slate-900">
                <tr>
                  <td colSpan={5} className="px-2 py-2.5 text-right">
                    합계
                  </td>
                  <Td align="right">
                    {partners.reduce((s, p) => s + p.order_count, 0).toLocaleString()}
                  </Td>
                  <Td align="right">
                    {partners.reduce((s, p) => s + p.gross_sales, 0).toLocaleString()}
                  </Td>
                  <Td align="right" className="text-rose-700">
                    −{partners.reduce((s, p) => s + p.total_refund, 0).toLocaleString()}
                  </Td>
                  <Td align="right">
                    {partners.reduce((s, p) => s + p.net_sales, 0).toLocaleString()}
                  </Td>
                  <Td align="right" className="text-emerald-700">
                    {partners
                      .reduce((s, p) => s + p.total_commission, 0)
                      .toLocaleString()}
                  </Td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
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
    tone === "negative"
      ? "text-rose-600"
      : tone === "positive"
      ? "text-emerald-700"
      : "text-slate-900";
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

function Th({
  children,
  align = "center",
  sortable = false,
  active = false,
  asc = false,
  onClick,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  active?: boolean;
  asc?: boolean;
  onClick?: () => void;
}) {
  const alignCls =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  const interactive = sortable
    ? "cursor-pointer select-none hover:text-slate-900"
    : "";
  const arrow = active ? (asc ? " ▲" : " ▼") : "";
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-2 py-2.5 text-[12px] font-semibold ${alignCls} ${interactive}`}
      onClick={onClick}
    >
      {children}
      {sortable && (
        <span className={"text-[10px] " + (active ? "text-emerald-700" : "text-slate-300")}>
          {arrow || " ⇅"}
        </span>
      )}
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
  const alignCls =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return <td className={`whitespace-nowrap px-2 py-2 ${alignCls} ${className}`}>{children}</td>;
}
