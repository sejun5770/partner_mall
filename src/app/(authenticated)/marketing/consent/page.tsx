import { redirect } from "next/navigation";
import { getCurrentUser, specialRoleOf } from "@/lib/auth";
import ConsentTable from "./ConsentTable";

/**
 * Casamia (까사미아) marketing-consent statistics. Visible to:
 *   - The casamia_mkt special-role account (its only landing page).
 *   - Admins (for ops checks).
 * Other partners get bounced back to /settlement.
 */
export default async function MarketingConsentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");
  const role = specialRoleOf(user);
  if (role !== "casamia_mkt" && !user.isAdmin) redirect("/settlement");

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            마케팅 동의 통계
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            업체쪽으로 DB 전송한 일자별 가입 / 기존회원 건수 (PC · 모초)
          </p>
        </div>
        <span className="text-xs text-slate-400">
          {user.partnerName} · {user.userId}
        </span>
      </header>
      <ConsentTable />
    </main>
  );
}
