import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account/signin");

  return (
    <>
      <div className="search">
        <div className="title">
          <h4>대시보드</h4>
        </div>
      </div>

      <div className="form_wrap">
        <table>
          <tbody>
            <tr>
              <th>업체명</th>
              <td>{user.partnerName}</td>
              <th>담당자 ID</th>
              <td>{user.userId}</td>
            </tr>
            <tr>
              <th>이메일</th>
              <td>{user.email}</td>
              <th>업체 코드</th>
              <td>{user.partnerShopId}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <DashboardCard title="주문관리" href="/order" description="주문 현황을 조회하고 관리합니다." />
        <DashboardCard title="상품조회" href="/product" description="등록된 상품 카탈로그를 조회합니다." />
        <DashboardCard title="정산관리" href="/settlement" description="매출 및 정산 내역을 확인합니다." />
        <DashboardCard title="업체정보" href="/partner" description="업체 정보를 조회하고 수정합니다." />
      </div>
    </>
  );
}

function DashboardCard({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <a
      href={href}
      style={{
        flex: 1,
        padding: "30px",
        border: "1px solid #e3e6f0",
        borderRadius: "5px",
        textAlign: "center",
        textDecoration: "none",
        transition: "box-shadow 0.2s",
      }}
    >
      <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "10px", color: "#8165bc" }}>
        {title}
      </h3>
      <p style={{ fontSize: "13px", color: "#666", lineHeight: "20px" }}>{description}</p>
    </a>
  );
}
