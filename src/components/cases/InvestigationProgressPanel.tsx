"use client";

import { Panel } from "@/components/common";
import type { InvestigationProgressCounts } from "./investigationProgressSummary";
import {
  INVESTIGATION_SECTION_IDS,
  scrollToInvestigationSection,
} from "./investigationProgressSummary";

function StatButton({
  label,
  count,
  targetId,
  emphasize,
}: {
  label: string;
  count: number;
  targetId: string;
  emphasize?: "pending" | "done";
}) {
  const countClass =
    emphasize === "done"
      ? "text-slate-700"
      : count > 0
        ? "text-amber-800"
        : "text-neutral-500";

  return (
    <button
      type="button"
      className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      onClick={() => scrollToInvestigationSection(targetId)}
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${countClass}`}>
        {count}
      </div>
    </button>
  );
}

/**
 * 轻量「调查进度」汇总：区分待补上下文 / 证据 / 核查 / 已完成勾选。
 * 不自动给出 Case 最终结论；点击仅滚动到既有区域。
 */
export function InvestigationProgressPanel({
  counts,
}: {
  counts: InvestigationProgressCounts;
}) {
  return (
    <div id={INVESTIGATION_SECTION_IDS.progress}>
      <Panel
        title="调查进度"
        extra={
          <span className="text-xs text-neutral-500">
            汇总当前待办，非最终结论
          </span>
        }
      >
        <p className="mb-3 text-xs leading-5 text-neutral-600">
          基于业务上下文、建议核查列表与案件核查清单的当前可见数据；不替代人工研判，也不自动关闭案件。
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatButton
            label="待补充上下文"
            count={counts.pendingContext}
            targetId={INVESTIGATION_SECTION_IDS.businessContext}
            emphasize="pending"
          />
          <StatButton
            label="待收集证据"
            count={counts.pendingEvidence}
            targetId={INVESTIGATION_SECTION_IDS.evidence}
            emphasize="pending"
          />
          <StatButton
            label="待完成核查"
            count={counts.pendingChecks}
            targetId={INVESTIGATION_SECTION_IDS.checklist}
            emphasize="pending"
          />
          <StatButton
            label="已完成"
            count={counts.completedChecks}
            targetId={INVESTIGATION_SECTION_IDS.checklist}
            emphasize="done"
          />
        </div>
      </Panel>
    </div>
  );
}
