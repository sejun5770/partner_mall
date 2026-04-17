import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettlementList from "./SettlementList";

export default async function SettlementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <main>
      <h1>정산관리</h1>
      <SettlementList isAdmin={user.isAdmin} />
    </main>
  );
}
