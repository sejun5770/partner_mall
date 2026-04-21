"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ViewAsClient({ isPartner }: { isPartner: boolean }) {
  const router = useRouter();
  const label = isPartner ? "제휴사(비관리자)" : "관리자";

  useEffect(() => {
    const id = setTimeout(() => router.replace("/dashboard"), 800);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <div style={{ fontFamily: "Pretendard, sans-serif", padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <p style={{ fontSize: 14, color: "#111" }}>
        <strong>{label}</strong> 뷰로 전환했습니다.
      </p>
      <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
        대시보드로 이동 중... 자동으로 이동하지 않으면{" "}
        <Link href="/dashboard" style={{ color: "#8165bc", textDecoration: "underline" }}>
          여기를 클릭
        </Link>
        하세요.
      </p>
      <p style={{ marginTop: 24, fontSize: 12, color: "#999" }}>
        다른 뷰로 전환:{" "}
        {isPartner ? (
          <Link href="/dev/view-as/admin" style={{ color: "#8165bc" }}>
            관리자로 전환
          </Link>
        ) : (
          <Link href="/dev/view-as/partner" style={{ color: "#8165bc" }}>
            제휴사로 전환
          </Link>
        )}
      </p>
    </div>
  );
}
