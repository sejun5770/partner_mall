import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <span className="text-sm text-slate-500">
          {user.isAdmin ? "관리자" : user.partnerName} · {user.userId}
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <th scope="row" className="w-1/6 bg-slate-50 px-4 py-3 text-left font-medium text-slate-700">
                업체명
              </th>
              <td className="w-1/3 px-4 py-3">{user.partnerName}</td>
              <th scope="row" className="w-1/6 bg-slate-50 px-4 py-3 text-left font-medium text-slate-700">
                담당자 ID
              </th>
              <td className="w-1/3 px-4 py-3">{user.userId}</td>
            </tr>
            <tr>
              <th scope="row" className="bg-slate-50 px-4 py-3 text-left font-medium text-slate-700">
                이메일
              </th>
              <td className="px-4 py-3">{user.email || "-"}</td>
              <th scope="row" className="bg-slate-50 px-4 py-3 text-left font-medium text-slate-700">
                업체 코드
              </th>
              <td className="px-4 py-3">{user.partnerShopId}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
