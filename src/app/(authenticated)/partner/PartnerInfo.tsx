"use client";

import { useState, useEffect } from "react";

interface PartnerData {
  partner: {
    id: number;
    partner_name: string;
    commission_rate: number;
  };
  user: {
    id: number;
    user_id: string;
    email: string;
  };
  stats: {
    total_orders: number;
    total_sales: number;
    total_users: number;
  };
}

export default function PartnerInfo({
  partnerShopId,
  userId,
}: {
  partnerShopId: number;
  userId: string;
}) {
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/partner?partnerShopId=${partnerShopId}&userId=${userId}`);
        const result = await res.json();
        setData(result);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchData();
  }, [partnerShopId, userId]);

  if (loading) {
    return <p style={{ textAlign: "center", padding: "40px" }}>로딩 중...</p>;
  }

  if (!data) {
    return <p style={{ textAlign: "center", padding: "40px" }}>업체 정보를 불러올 수 없습니다.</p>;
  }

  return (
    <div className="manage">
      {/* Partner Basic Info */}
      <div className="form_wrap">
        <div style={{ marginBottom: "10px", position: "relative", paddingLeft: "18px" }}>
          <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: "12px" }}>▶</span>
          <h4 style={{ fontSize: "15px", fontWeight: 600 }}>업체 기본정보</h4>
        </div>
        <table>
          <tbody>
            <tr>
              <th>업체명</th>
              <td>{data.partner.partner_name}</td>
              <th>업체코드</th>
              <td>{data.partner.id}</td>
            </tr>
            <tr>
              <th>수수료율</th>
              <td>{data.partner.commission_rate}%</td>
              <th>상태</th>
              <td><span style={{ color: "#268652", fontWeight: 600 }}>활성</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Account Info */}
      <div className="form_wrap" style={{ marginTop: "20px" }}>
        <div style={{ marginBottom: "10px", position: "relative", paddingLeft: "18px" }}>
          <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: "12px" }}>▶</span>
          <h4 style={{ fontSize: "15px", fontWeight: 600 }}>담당자 정보</h4>
        </div>
        <table>
          <tbody>
            <tr>
              <th>아이디</th>
              <td>{data.user.user_id}</td>
              <th>이메일</th>
              <td>{data.user.email}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="form_wrap" style={{ marginTop: "20px" }}>
        <div style={{ marginBottom: "10px", position: "relative", paddingLeft: "18px" }}>
          <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: "12px" }}>▶</span>
          <h4 style={{ fontSize: "15px", fontWeight: 600 }}>통계 요약</h4>
        </div>
        <table>
          <tbody>
            <tr>
              <th>총 주문수</th>
              <td>{data.stats.total_orders.toLocaleString()} 건</td>
              <th>총 매출</th>
              <td>{data.stats.total_sales.toLocaleString()} 원</td>
            </tr>
            <tr>
              <th>제휴 회원수</th>
              <td>{data.stats.total_users.toLocaleString()} 명</td>
              <th></th>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
