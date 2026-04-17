import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import OrderList from "./OrderList";

export default async function OrderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <>
      <div className="search">
        <div className="title">
          <h4>주문관리</h4>
        </div>
      </div>
      <OrderList partnerShopId={user.partnerShopId} />
    </>
  );
}
