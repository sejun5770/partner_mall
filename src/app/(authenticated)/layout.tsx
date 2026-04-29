import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/account/signin");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header userName={user.partnerName} isAdmin={user.isAdmin} />
      {/* Child pages wrap their content in <main>; we only need a flex
          grow container here so the footer sticks to the bottom on short
          pages. */}
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
