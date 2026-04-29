import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import MonthlyByPartner from "./MonthlyByPartner";

/**
 * Admin-only — monthly settlement totals grouped by partner. Lets ops
 * scan every partner's settlement payout for a given month in one view
 * (vs. flipping the partner dropdown one-by-one on /settlement).
 */
export default async function MonthlySettlementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");
  if (!user.isAdmin) redirect("/settlement");

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            월별 업체 정산
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            월을 선택하면 해당 월의 업체별 결제·환불·정산금액을 한눈에 조회합니다.
          </p>
        </div>
        <span className="text-xs text-slate-400">
          관리자 · {user.partnerName}
        </span>
      </header>
      <MonthlyByPartner />
    </main>
  );
}
