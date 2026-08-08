import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Security Triage Assistant",
  description: "数据与网络安全联合研判及报告助手",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // suppressHydrationWarning：部分浏览器扩展会改写 <html> 属性导致 hydration 误报
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-neutral-100 antialiased">{children}</body>
    </html>
  );
}
