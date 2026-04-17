import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProductList from "./ProductList";

export default async function ProductPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <>
      <div className="search">
        <div className="title">
          <h4>상품조회</h4>
        </div>
      </div>
      <ProductList />
    </>
  );
}
