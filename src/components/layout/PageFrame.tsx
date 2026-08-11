import type { ReactNode } from "react";
import { pageWidth, type PageWidth } from "./pageChrome";

/** 页面内容宽度壳：不改变 AppShell，只约束子页节奏 */
export function PageFrame({
  width = "normal",
  children,
  className = "",
}: {
  width?: PageWidth;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${pageWidth[width]} space-y-5 ${className}`.trim()}>
      {children}
    </div>
  );
}
