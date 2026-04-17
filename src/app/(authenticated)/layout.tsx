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
    <>
      <Header userName={user.partnerName} />
      <div className="mall">
        {children}
      </div>
      <Footer />
    </>
  );
}
