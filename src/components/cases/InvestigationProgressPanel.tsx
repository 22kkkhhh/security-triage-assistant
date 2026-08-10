"use client";

import { Panel } from "@/components/common";
import { resolveCaseNextStep } from "./caseNextStep";
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

const NAV_LINKS: ReadonlyArray<{ label: string; targetId: string }> = [
  { label: "业务上下文", targetId: INVESTIGATION_SECTION_IDS.businessContext },
  { label: "证据", targetId: INVESTIGATION_SECTION_IDS.evidence },
  { label: "待核查事项", targetId: INVESTIGATION_SECTION_IDS.checklist },
  { label: "人工研判", targetId: INVESTIGATION_SECTION_IDS.humanReview },
  { label: "合规参考", targetId: INVESTIGATION_SECTION_IDS.compliance },
];

function InvestigationNav() {
  return (
    <nav
      aria-label="调查导航"
      className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-100 pt-3 text-xs"
    >
      {NAV_LINKS.map((link) => (
        <button
          key={link.targetId}
          type="button"
          className="text-slate-700 underline underline-offset-2 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          onClick={() => scrollToInvestigationSection(link.targetId)}
        >
          {link.label}
        </button>
      ))}
    </nav>
  );
}

function NextStepBlock({ view }: { view: InvestigationProgressPanelView }) {
  const step = resolveCaseNextStep(view);

  return (
    <div
      className={
        step.isUnavailable
          ? "mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2.5"
          : "mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2.5"
      }
      data-testid="case-next-step"
    >
      <p className="text-xs font-medium text-neutral-600">建议下一步</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={
              step.isUnavailable
                ? "text-sm font-medium text-amber-900"
                : "text-sm font-medium text-neutral-900"
            }
          >
            {step.title}
          </p>
          {!step.isUnavailable && (
            <p className="mt-0.5 text-xs text-neutral-600">{step.detail}</p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          data-testid="case-next-step-cta"
          onClick={() => scrollToInvestigationSection(step.targetId)}
        >
          {step.ctaLabel}
        </button>
      </div>
    </div>
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
          <NextStepBlock view={view} />
          <InvestigationNav />
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
        <NextStepBlock view={view} />
        <InvestigationNav />
      </Panel>
    </div>
  );
}
