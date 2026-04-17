import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "바른손몰 B2B 지원 시스템 - 로그인",
  description: "바른손몰 B2B 지원 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
