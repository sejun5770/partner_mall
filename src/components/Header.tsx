"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface HeaderProps {
  userName: string;
  isAdmin?: boolean;
  specialRole?: "casamia_mkt" | null;
}

interface NavItem {
  label: string;
  href: string;
  adminOnly?: boolean;
}

const STANDARD_NAV: NavItem[] = [
  { label: "정산관리", href: "/settlement" },
  { label: "월별 정산", href: "/settlement/monthly", adminOnly: true },
  { label: "업체정보", href: "/partner" },
];

// 까사미아 마케팅 계정은 정산/업체정보 영역을 사용하지 않고 마케팅
// 동의 통계만 볼 수 있음.
const CASAMIA_MKT_NAV: NavItem[] = [
  { label: "마케팅 동의 통계", href: "/marketing/consent" },
];

export default function Header({ userName, isAdmin, specialRole }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogout, setShowLogout] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!showLogout) return;
    const onDocClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowLogout(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showLogout]);

  const handleLogout = async () => {
    await fetch("/api/account/signout", { method: "POST" });
    router.push("/account/signin");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        {/* Logo */}
        <Link
          href="/settlement"
          className="flex items-center gap-1.5 text-slate-900 hover:opacity-80"
        >
          <span
            aria-hidden
            className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-emerald-400 to-teal-500"
          />
          <span className="font-semibold tracking-tight">
            바른손몰 <span className="text-slate-400 font-normal">B2B</span>
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex flex-1 items-center gap-1">
          {(specialRole === "casamia_mkt" ? CASAMIA_MKT_NAV : STANDARD_NAV)
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
            // /settlement/monthly should NOT also light up the parent
            // /settlement entry — use exact-or-prefix matching instead of
            // raw startsWith().
            const active =
              pathname === item.href ||
              (item.href !== "/settlement" && pathname.startsWith(item.href + "/")) ||
              (item.href === "/settlement" && pathname === "/settlement");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "relative inline-flex h-14 items-center px-3 text-sm font-medium transition-colors " +
                  (active
                    ? "text-slate-900"
                    : "text-slate-500 hover:text-slate-900")
                }
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-slate-900"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setShowLogout((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            aria-haspopup="menu"
            aria-expanded={showLogout}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
              {userName?.[0] ?? "?"}
            </span>
            <span className="max-w-[10rem] truncate">{userName} 님</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showLogout ? "rotate-180" : ""}`}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showLogout && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
