"use client";

import type {
  DataLifecycleProjection,
  DataLifecycleReference,
  DataLifecycleStageStatus,
} from "@/services/correlation/dataLifecycle";

const statusLabel: Record<DataLifecycleStageStatus, string> = {
  OBSERVED: "已观测",
  POSSIBLE: "可能涉及",
  NOT_OBSERVED: "未发现",
  INSUFFICIENT: "信息不足",
};

const statusClass: Record<DataLifecycleStageStatus, string> = {
  OBSERVED: "border-blue-200 bg-blue-50 text-blue-700",
  POSSIBLE: "border-amber-200 bg-amber-50 text-amber-700",
  NOT_OBSERVED: "border-neutral-200 bg-neutral-50 text-neutral-600",
  INSUFFICIENT: "border-neutral-200 bg-white text-neutral-500",
};

export function DataLifecyclePanel({
  projection,
  onReferenceClick,
}: {
  projection: DataLifecycleProjection;
  onReferenceClick?: (reference: DataLifecycleReference) => void;
}) {
  return (
    <section
      className="mt-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
      aria-labelledby="data-lifecycle-title"
      data-testid="data-lifecycle-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="data-lifecycle-title" className="text-base font-semibold text-neutral-900">
            数据生命周期
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            基于当前案件已接入的告警、证据与时间线定位阶段；不等同于合规或泄露结论。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-500" aria-label="生命周期统计">
          <span>已观测 {projection.observedCount}</span>
          <span aria-hidden="true">·</span>
          <span>可能涉及 {projection.possibleCount}</span>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="数据生命周期阶段">
        {projection.stages.map((stage) => (
          <li key={stage.key} className="min-w-0 rounded-md border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium text-neutral-800">{stage.title}</h3>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass[stage.status]}`}>
                {statusLabel[stage.status]}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">{stage.summary}</p>
            {stage.references.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stage.references.slice(0, 3).map((reference) => (
                  <button
                    key={`${reference.kind}:${reference.id}`}
                    type="button"
                    className="max-w-full truncate rounded border border-neutral-200 px-2 py-1 text-left text-[11px] text-[var(--ui-brand-hover)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus-ring)]"
                    onClick={() => onReferenceClick?.(reference)}
                    aria-label={`查看${reference.kind === "EVIDENCE" ? "证据" : "时间线"}依据：${reference.label}`}
                  >
                    {reference.kind === "EVIDENCE" ? "证据" : "时间线"} · {reference.label}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
