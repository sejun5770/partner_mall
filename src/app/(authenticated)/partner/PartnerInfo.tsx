"use client";

import { useEffect, useState } from "react";

interface PartnerData {
  partner: {
    company_seq: number;
    login_id: string;
    company_name: string;
    company_num: string;
    email: string;
    status: string;
  };
  contact: {
    boss_name: string;
    boss_tel: string;
    fax: string;
    manager_name: string;
    manager_email: string;
    manager_tel: string;
    manager_hp: string;
  };
  address: {
    zip: string;
    front: string;
    back: string;
  };
  bank: {
    name: string;
    account_no: string;
  };
  regist_date: string | null;
  is_admin: boolean;
}

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "slate" }> = {
  S2: { label: "활성", tone: "green" },
  S1: { label: "대기", tone: "amber" },
  S3: { label: "비활성", tone: "slate" },
};

const STATUS_TONE_CLASS = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function PartnerInfo() {
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/partner")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Partial<PartnerData> & {
          message?: string;
        };
        if (!cancelled) {
          if (!res.ok) {
            setError(body.message || "업체 정보를 불러올 수 없습니다.");
            setData(null);
          } else {
            setData(body as PartnerData);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("업체 정보를 불러올 수 없습니다.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-500">로딩 중…</p>;
  }
  if (error || !data) {
    return <p className="py-12 text-center text-sm text-rose-600">{error ?? "데이터 없음"}</p>;
  }

  const status = STATUS_LABEL[data.partner.status] ?? { label: data.partner.status || "-", tone: "slate" as const };

  return (
    <div className="space-y-5">
      <Section title="업체 기본정보">
        <Grid>
          <Field label="업체명" value={data.partner.company_name} strong />
          <Field
            label="상태"
            value={
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE_CLASS[status.tone]}`}
              >
                {status.label}
              </span>
            }
          />
          <Field label="아이디" value={data.partner.login_id} mono />
          <Field label="업체 코드" value={data.partner.company_seq} mono />
          <Field label="사업자번호" value={data.partner.company_num || "-"} mono />
          <Field label="대표 이메일" value={data.partner.email || "-"} />
        </Grid>
      </Section>

      <Section title="대표 / 담당자">
        <Grid>
          <Field label="대표자명" value={data.contact.boss_name || "-"} />
          <Field label="대표 전화" value={data.contact.boss_tel || "-"} />
          <Field label="FAX" value={data.contact.fax || "-"} />
          <Field label="담당자" value={data.contact.manager_name || "-"} />
          <Field label="담당자 전화" value={data.contact.manager_tel || "-"} />
          <Field label="담당자 휴대폰" value={data.contact.manager_hp || "-"} />
          <Field label="담당자 이메일" value={data.contact.manager_email || "-"} />
        </Grid>
      </Section>

      <Section title="주소">
        <p className="text-sm text-slate-700">
          {data.address.zip && (
            <span className="mr-2 text-slate-500">[{data.address.zip}]</span>
          )}
          {data.address.front || "-"}
          {data.address.back && <span className="ml-1 text-slate-500">{data.address.back}</span>}
        </p>
      </Section>

      <Section title="정산 계좌">
        <Grid>
          <Field label="은행" value={data.bank.name || "-"} />
          <Field label="계좌번호" value={data.bank.account_no || "-"} mono />
        </Grid>
      </Section>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ※ 정보변경은 관리자에게 문의해 주세요.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">{children}</dl>;
}

function Field({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-28 shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`flex-1 text-sm ${strong ? "font-semibold text-slate-900" : "text-slate-800"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
