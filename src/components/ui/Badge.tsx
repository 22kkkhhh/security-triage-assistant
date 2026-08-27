import type { ReactNode } from "react";

type BadgeTone = "normal" | "abnormal" | "unknown" | "low" | "medium" | "high" | "critical";

export function Badge({ tone = "unknown", children, className = "" }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const toneClass = tone === "normal" ? "ui-badge-normal" : tone === "abnormal" ? "ui-badge-abnormal" : tone === "unknown" ? "ui-badge-unknown" : `ui-badge-risk-${tone}`;
  return <span className={`ui-badge ${toneClass} ${className}`.trim()}>{children}</span>;
}
