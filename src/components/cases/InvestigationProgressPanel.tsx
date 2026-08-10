"use client";

import { Panel } from "@/components/common";
import type { InvestigationProgressPanelView } from "./investigationProgressSummary";
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
 * 调查进度：消费 Server Investigation Progress DTO 的展示模型。
 * 不运行 progress resolver；RESOLVED ≠ Human final conclusion。
 */
export function InvestigationProgressPanel({
  view,
}: {
  view: InvestigationProgressPanelView;
}) {
  if (view.resolutionStatus === "RESOLUTION_UNAVAILABLE") {
    return (
      <div id={INVESTIGATION_SECTION_IDS.progress}>
        <Panel
          title="调查进度"
          extra={<span className="text-xs text-amber-700">当前不可用</span>}
        >
          <p
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900"
            role="status"
            data-testid="investigation-progress-unavailable"
          >
            调查进度暂不可用。当前无法完成重新解析，请稍后刷新后继续核查；不得将当前状态视为已完成核查或全部已解决。
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div id={INVESTIGATION_SECTION_IDS.progress}>
      <Panel
        title="调查进度"
        extra={
          <span className="text-xs text-neutral-500">
            调查概览 · 非最终结论
          </span>
        }
      >
        <p className="mb-3 text-xs leading-5 text-neutral-600">
          {view.disclaimer}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatButton
            label="待补充上下文"
            count={view.pendingContext}
            targetId={INVESTIGATION_SECTION_IDS.businessContext}
            emphasize="pending"
          />
          <StatButton
            label="待收集证据"
            count={view.pendingEvidence}
            targetId={INVESTIGATION_SECTION_IDS.evidence}
            emphasize="pending"
          />
          <StatButton
            label="待完成核查"
            count={view.pendingChecks}
            targetId={INVESTIGATION_SECTION_IDS.checklist}
            emphasize="pending"
          />
          <StatButton
            label="已解决"
            count={view.resolvedCount}
            targetId={INVESTIGATION_SECTION_IDS.checklist}
            emphasize="done"
          />
        </div>
        <p
          className="mt-3 text-xs text-neutral-500"
          data-testid="investigation-progress-human-review-fact"
        >
          {view.humanReviewFactLabel}
        </p>
      </Panel>
    </div>
  );
}
