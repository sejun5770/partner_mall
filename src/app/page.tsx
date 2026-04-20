"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Root page (`/` or `${basePath}/`).
 *
 * We deliberately do NOT use a server-side `redirect()` here because the
 * docker-manager reverse proxy in front of the container has been observed
 * stripping the `Location` header from 307 responses, which leaves the
 * browser with a 200 + empty body and no forwarding — users see a blank
 * page. A client-side `router.replace()` sidesteps that entirely.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "Pretendard, sans-serif" }}>
      <p style={{ fontSize: 14, color: "#666" }}>대시보드로 이동 중…</p>
      <p style={{ marginTop: 12, fontSize: 13 }}>
        자동으로 이동하지 않으면{" "}
        <Link href="/dashboard" style={{ color: "#8165bc", textDecoration: "underline" }}>
          여기를 클릭
        </Link>
        하세요.
      </p>
    </div>
  );
}
