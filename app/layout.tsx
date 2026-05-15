import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "5010 Content Tracker",
  description: "브랜드 멘션 모니터링 + SEO 순위 추적",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <nav className="top">
          <strong>5010 Tracker</strong>
          <Link href="/">대시보드</Link>
          <Link href="/mentions">멘션</Link>
          <Link href="/seo">SEO 순위</Link>
          <Link href="/keywords">키워드</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
