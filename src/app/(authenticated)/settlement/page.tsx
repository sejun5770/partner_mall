import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettlementList from "./SettlementList";

export default async function SettlementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-900">정산관리</h1>
        <span className="text-sm text-slate-500">
          {user.isAdmin ? "관리자" : user.partnerName} · {user.userId}
        </span>
      </div>
      <SettlementList isAdmin={user.isAdmin} />
    </main>
  );
}
