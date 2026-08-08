import type { ReactNode } from "react";
import { observationStatusLabels, riskLevelLabels } from "@/domain/labels";
import type { ObservationStatus, RiskLevel } from "@/domain/types";

/**
 * 三态徽标：UNKNOWN（琥珀色）必须与 NORMAL（绿色）明显区分。
 */
export const statusStyle: Record<ObservationStatus, string> = {
  NORMAL: "bg-green-100 text-green-800 border-green-300",
  ABNORMAL: "bg-red-100 text-red-800 border-red-300",
  UNKNOWN: "bg-amber-100 text-amber-800 border-amber-300",
};

export function StatusBadge({ status }: { status: ObservationStatus }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${statusStyle[status]}`}
    >
      {observationStatusLabels[status]}
    </span>
  );
}

export const riskStyle: Record<RiskLevel, string> = {
  LOW: "bg-green-100 text-green-800 border-green-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
};

export function RiskBadge({ level }: { level: RiskLevel | null }) {
  if (level === null) {
    return (
      <span className="inline-block rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        证据不足
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${riskStyle[level]}`}
    >
      {riskLevelLabels[level]}
    </span>
  );
}

export function Field({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex gap-2 text-sm leading-6">
      <span className="shrink-0 text-neutral-500">{label}：</span>
      <span className="text-neutral-900">{value ?? "（无数据）"}</span>
    </div>
  );
}

export function Panel({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {extra}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
