import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Security Triage Assistant",
  description: "数据与网络安全联合研判及报告助手",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-100 antialiased">{children}</body>
    </html>
  );
}
