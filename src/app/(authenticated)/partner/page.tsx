import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import PartnerInfo from "./PartnerInfo";

export default async function PartnerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <>
      <div className="search">
        <div className="title">
          <h4>업체정보</h4>
        </div>
      </div>
      <PartnerInfo partnerShopId={user.partnerShopId} userId={user.userId} />
    </>
  );
}
