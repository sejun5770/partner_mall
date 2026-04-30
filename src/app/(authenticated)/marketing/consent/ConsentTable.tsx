"use client";

import { useCallback, useEffect, useState } from "react";

interface DailyRow {
  send_day: string;
  signup_pc: number;
  signup_mobile: number;
  existing_pc: number;
  existing_mobile: number;
}

interface ConsentResponse {
  month: string;
  rows: DailyRow[];
  totals: {
    signup_pc: number;
    signup_mobile: number;
    existing_pc: number;
    existing_mobile: number;
  };
}

function fmtMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ConsentTable() {
  const [month, setMonth] = useState(() => fmtMonth(new Date()));
  const [data, setData] = useState<ConsentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/consent?month=${month}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as ConsentResponse;
      setData(body);
    } catch {
      setError("데이터를 불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setPrev = () => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() - 1);
    setMonth(fmtMonth(d));
  };
  const setNext = () => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + 1);
    setMonth(fmtMonth(d));
  };
  const setCurr = () => setMonth(fmtMonth(new Date()));

  return (
    <div className="space-y-5">
      {/* Filter */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">검색년월</label>
          <button
            type="button"
            onClick={setPrev}
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
            onClick={setNext}
            aria-label="다음월"
            className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={setCurr}
            className="h-9 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            당월
          </button>
        </div>
      </section>

      {/* Totals */}
      {data && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="가입 (PC)" value={data.totals.signup_pc} />
          <SummaryCard label="가입 (모초)" value={data.totals.signup_mobile} />
          <SummaryCard
            label="기존회원 (PC)"
            value={data.totals.existing_pc}
            tone="muted"
          />
          <SummaryCard
            label="기존회원 (모초)"
            value={data.totals.existing_mobile}
            tone="muted"
          />
        </section>
      )}

      {/* Table */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
          {data ? `${data.month} · ${data.rows.length}일` : ""}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <Th>업체쪽으로 DB 전송한 날짜</Th>
                <Th align="right">가입건수 (PC)</Th>
                <Th align="right">가입건수 (모초)</Th>
                <Th align="right">기존회원건수 (PC)</Th>
                <Th align="right">기존회원건수 (모초)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    로딩 중...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-rose-600">
                    {error}
                  </td>
                </tr>
              ) : !data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <p className="text-sm text-slate-500">
                      조회된 데이터가 없습니다.
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      DB 송부가 일시 중단된 기간이거나, 데이터 출처 확정이 필요한
                      상태일 수 있습니다. 운영팀에 문의 부탁드립니다.
                    </p>
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.send_day} className="hover:bg-slate-50">
                    <Td>{r.send_day}</Td>
                    <Td align="right">{r.signup_pc.toLocaleString()}</Td>
                    <Td align="right">{r.signup_mobile.toLocaleString()}</Td>
                    <Td align="right" className="text-slate-500">
                      {r.existing_pc.toLocaleString()}
                    </Td>
                    <Td align="right" className="text-slate-500">
                      {r.existing_mobile.toLocaleString()}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="bg-slate-100 font-semibold text-slate-900">
                <tr>
                  <Td>합계</Td>
                  <Td align="right">{data.totals.signup_pc.toLocaleString()}</Td>
                  <Td align="right">
                    {data.totals.signup_mobile.toLocaleString()}
                  </Td>
                  <Td align="right" className="text-slate-700">
                    {data.totals.existing_pc.toLocaleString()}
                  </Td>
                  <Td align="right" className="text-slate-700">
                    {data.totals.existing_mobile.toLocaleString()}
                  </Td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        ※ PC = 바른손몰 PC 가입 / 모초 = 모바일 초대장 (barun_reg_site=&apos;SB&apos;)
        ・ 신규 가입 = 동일일자 가입 / 기존 회원 = 이전 가입자
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "muted";
}) {
  const valueColor = tone === "muted" ? "text-slate-700" : "text-emerald-700";
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${valueColor}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-slate-400">건</span>
      </div>
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
  const alignCls =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold ${alignCls}`}
    >
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
  const alignCls =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <td className={`whitespace-nowrap px-3 py-2 ${alignCls} ${className}`}>
      {children}
    </td>
  );
}
