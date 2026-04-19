"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

interface HeaderProps {
  userName: string;
}

const NAV_ITEMS = [
  { label: "주문관리", href: "/order" },
  { label: "상품조회", href: "/product" },
  { label: "정산관리", href: "/settlement" },
  { label: "업체정보", href: "/partner" },
];

export default function Header({ userName }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogout, setShowLogout] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/account/signout", { method: "POST" });
    router.push("/account/signin");
  };

  return (
    <header className="app-header">
      <div className="logo">
        <a href="/dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://static.barunsoncard.com/barunsonmall/admin/images/logo_w.svg"
            alt="바른손몰"
            style={{ height: "22px" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              const span = document.createElement("span");
              span.textContent = "바른손몰 B2B";
              span.style.color = "#fff";
              span.style.fontSize = "16px";
              span.style.fontWeight = "700";
              (e.target as HTMLImageElement).parentElement?.appendChild(span);
            }}
          />
        </a>
      </div>
      <nav className="navbar">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li
              key={item.href}
              className={pathname.startsWith(item.href) ? "active" : ""}
            >
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="profile">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setShowLogout(!showLogout);
          }}
        >
          {userName} 님
        </a>
        <div className="logout" style={{ display: showLogout ? "block" : "none" }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleLogout();
            }}
          >
            로그아웃
          </a>
        </div>
      </div>
    </header>
  );
}
