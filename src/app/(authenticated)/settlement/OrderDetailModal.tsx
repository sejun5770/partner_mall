"use client";

import { useEffect, useState } from "react";
import type { Category } from "@/lib/category";
import { CATEGORY_LABEL } from "@/lib/category";

interface OrderItem {
  card_code: string;
  card_name: string;
  card_div: string;
  category: Category;
  count: number;
  unit_price: number;
  amount: number;
}

interface OrderDetail {
  order_seq: number;
  login_id: string;
  company_name: string;
  category: Category | null; // active category (null = 전체)
  orderer: {
    name: string;
    member_id: string;
    email: string;
    phone: string;
    hphone: string;
  };
  payment: {
    pay_type: string;
    pg_amount: number;
    last_total_price: number;
    item_total: number;
    order_total_price: number;
    full_last_total_price: number;
    full_item_total: number;
    category_breakdown: {
      invitation: number;
      thankyou: number;
      goods: number;
    };
  };
  dates: {
    order_at: string | null;
    ap_at: string | null;
    compose_at: string | null;
    confirm_at: string | null;
    print_at: string | null;
    send_at: string | null;
    cancel_at: string | null;
  };
  etc_comment: string;
  items: OrderItem[];
}

const PAY_TYPE_LABEL: Record<string, string> = {
  C: "신용카드",
  R: "실시간계좌이체",
  V: "가상계좌",
  M: "휴대폰",
  S: "간편결제",
  P: "포인트",
  K: "카카오페이",
  N: "네이버페이",
};

function payTypeLabel(code: string): string {
  if (!code) return "-";
  return PAY_TYPE_LABEL[code.trim().toUpperCase()] ?? code;
}

function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "0";
  return Number(n).toLocaleString();
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  return s;
}

function fmtDateOnly(s: string | null | undefined): string {
  if (!s) return "";
  // Server hands us "YYYY-MM-DD HH:mm:ss" — trim seconds for display.
  return s.length >= 16 ? s.slice(0, 16) : s;
}

export default function OrderDetailModal({
  orderSeq,
  category,
  onClose,
}: {
  orderSeq: number;
  /**
   * Active settlement tab. When set, the modal slices items + amounts to
   * the same scope as the list (e.g. on the 청첩장 tab, only invitation
   * items are listed and 결제금액 = invitation slice). null = 전체 탭.
   */
  category: Category | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = category
      ? `/api/settlement/order/${orderSeq}?category=${category}`
      : `/api/settlement/order/${orderSeq}`;
    fetch(url)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        } & Partial<OrderDetail>;
        if (!cancelled) {
          if (!res.ok) {
            setError(body.message || "주문 정보를 불러올 수 없습니다.");
            setData(null);
          } else {
            setData(body as OrderDetail);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("주문 정보를 불러올 수 없습니다.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderSeq, category]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Order</span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">#{orderSeq}</h2>
            {data && (
              <span className="text-sm text-slate-500">
                · {data.company_name} <span className="text-slate-400">({data.login_id})</span>
              </span>
            )}
            {category && (
              <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                {CATEGORY_LABEL[category]} 기준
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-6 py-5">
          {loading && (
            <p className="py-16 text-center text-sm text-slate-500">로딩 중…</p>
          )}
          {error && (
            <p className="py-16 text-center text-sm text-rose-600">{error}</p>
          )}
          {data && !loading && !error && (
            <div className="space-y-5">
              {/* Amount summary — most prominent */}
              <section className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">상품 합계</p>
                  <p className="mt-0.5 text-base font-semibold text-slate-700">
                    {fmtAmount(data.payment.item_total)}
                    <span className="ml-0.5 text-xs font-normal text-slate-400">원</span>
                  </p>
                  {category && data.payment.full_item_total !== data.payment.item_total && (
                    <p className="text-[11px] text-slate-400">
                      전체 주문 상품: {fmtAmount(data.payment.full_item_total)}원
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {category ? `최종 결제금액 (${CATEGORY_LABEL[category]} 슬라이스)` : "최종 결제금액"}
                  </p>
                  <p className="mt-0.5 text-2xl font-bold text-emerald-700">
                    {fmtAmount(data.payment.last_total_price)}
                    <span className="ml-0.5 text-sm font-normal text-slate-400">원</span>
                  </p>
                  {category && data.payment.full_last_total_price !== data.payment.last_total_price && (
                    <p className="text-[11px] text-slate-400">
                      전체 주문 결제: {fmtAmount(data.payment.full_last_total_price)}원
                    </p>
                  )}
                </div>
              </section>

              {/* Items + Payment in two columns */}
              <div className="grid gap-4 md:grid-cols-2">
                <Section title="주문 상품" count={data.items.length}>
                  {data.items.length === 0 ? (
                    <p className="text-sm text-slate-400">-</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.items.map((it, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{it.card_code || "-"}</p>
                            {it.card_name && (
                              <p className="truncate text-xs text-slate-500">{it.card_name}</p>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {it.count.toLocaleString()}매
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="결제 정보">
                  <dl className="space-y-2 text-sm">
                    <Pair k="결제방법">
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                        {payTypeLabel(data.payment.pay_type)}
                      </span>
                    </Pair>
                    <Pair k="PG 결제액">{fmtAmount(data.payment.pg_amount)}원</Pair>
                    <Pair k="결제일">{fmtDateOnly(data.dates.ap_at) || fmtDateOnly(data.dates.order_at)}</Pair>
                    <Pair k="주문취소일">{data.dates.cancel_at ? fmtDateOnly(data.dates.cancel_at) : "-"}</Pair>
                  </dl>
                </Section>
              </div>

              {/* Process timeline */}
              <Section title="처리 진행">
                <Timeline
                  steps={[
                    { label: "주문",     at: data.dates.order_at },
                    { label: "초안",     at: data.dates.compose_at },
                    { label: "컨펌",     at: data.dates.confirm_at },
                    { label: "인쇄지시", at: data.dates.print_at },
                    { label: "배송",     at: data.dates.send_at },
                  ]}
                />
              </Section>

              {/* Orderer + contact */}
              <Section title="주문자 / 연락처">
                <div className="grid gap-3 sm:grid-cols-2">
                  <dl className="space-y-2 text-sm">
                    <Pair k="이름">{data.orderer.name || "-"}</Pair>
                    <Pair k="회원아이디">{data.orderer.member_id || "-"}</Pair>
                    <Pair k="E-Mail">
                      {data.orderer.email ? (
                        <a href={`mailto:${data.orderer.email}`} className="text-emerald-700 hover:underline">
                          {data.orderer.email}
                        </a>
                      ) : (
                        "-"
                      )}
                    </Pair>
                  </dl>
                  <dl className="space-y-2 text-sm">
                    <Pair k="유선전화">{data.orderer.phone || "-"}</Pair>
                    <Pair k="휴대전화">{data.orderer.hphone || "-"}</Pair>
                  </dl>
                </div>
              </Section>

              {/* Memo */}
              {data.etc_comment && (
                <Section title="기타 전달사항">
                  <p className="whitespace-pre-line text-sm text-slate-700">{data.etc_comment}</p>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {typeof count === "number" && (
          <span className="text-xs text-slate-400">{count.toLocaleString()}건</span>
        )}
      </header>
      {children}
    </section>
  );
}

function Pair({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-xs text-slate-500">{k}</dt>
      <dd className="flex-1 text-slate-800">{children}</dd>
    </div>
  );
}

function Timeline({ steps }: { steps: { label: string; at: string | null }[] }) {
  return (
    <ol className="grid grid-cols-5 gap-2">
      {steps.map((step, idx) => {
        const done = !!step.at;
        return (
          <li
            key={step.label}
            className="relative flex flex-col items-center text-center"
          >
            {/* connector */}
            {idx < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-1/2 top-3 h-px w-full ${
                  done ? "bg-emerald-300" : "bg-slate-200"
                }`}
              />
            )}
            <span
              className={`relative z-10 mb-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                done
                  ? "bg-emerald-500 text-white ring-4 ring-emerald-50"
                  : "bg-slate-200 text-slate-400 ring-4 ring-white"
              }`}
            >
              {idx + 1}
            </span>
            <span className={`text-xs font-medium ${done ? "text-slate-900" : "text-slate-400"}`}>
              {step.label}
            </span>
            <span className="mt-0.5 text-[10px] leading-tight text-slate-500">
              {done ? fmtDateOnly(step.at) : "-"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
