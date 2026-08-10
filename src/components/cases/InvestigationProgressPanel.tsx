"use client";

import type { ReactNode } from "react";
import { RiskBadge } from "@/components/common";
import { resolveCaseNextStep } from "./caseNextStep";
import type { InvestigationOverviewStats } from "./investigationOverviewStats";
import type { InvestigationProgressPanelView } from "./investigationProgressSummary";
import {
  INVESTIGATION_SECTION_IDS,
  scrollToInvestigationSection,
} from "./investigationProgressSummary";

function StatCell({
  label,
  value,
  onClick,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  onClick?: () => void;
  emphasize?: "warn" | "muted" | "neutral";
}) {
  const valueClass =
    emphasize === "warn"
      ? "text-amber-800"
      : emphasize === "muted"
        ? "text-neutral-500"
        : "text-neutral-900";

  const content = (
    <>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-left">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function RiskStat({ suggestedRiskLevel }: { suggestedRiskLevel: InvestigationOverviewStats["suggestedRiskLevel"] }) {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-left">
      <div className="text-xs text-neutral-500">系统建议风险</div>
      <div className="mt-1">
        {suggestedRiskLevel ? (
          <RiskBadge level={suggestedRiskLevel} />
        ) : (
          <span className="text-lg font-semibold text-neutral-500">—</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-neutral-400">
        辅助参考 · 非最终结论
      </p>
    </div>
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
          {step.ctaLabel === "去处理" ? "立即处理" : step.ctaLabel}
        </button>
      </div>
    </div>
  );
}

function ReportShortcut({
  hasReport,
  canWriteReport,
  onGoToReport,
}: {
  hasReport: boolean;
  canWriteReport: boolean;
  onGoToReport: () => void;
}) {
  if (hasReport) {
    return (
      <button
        type="button"
        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-50"
        onClick={onGoToReport}
      >
        {canWriteReport ? "继续编辑报告" : "查看报告"}
      </button>
    );
  }

  if (canWriteReport) {
    return (
      <button
        type="button"
        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 hover:bg-slate-50"
        onClick={onGoToReport}
      >
        生成报告
      </button>
    );
  }

  return null;
}

function OverviewShell({
  children,
  hasReport,
  canWriteReport,
  onGoToReport,
}: {
  children: ReactNode;
  hasReport: boolean;
  canWriteReport: boolean;
  onGoToReport?: () => void;
}) {
  return (
    <section
      id={INVESTIGATION_SECTION_IDS.progress}
      className="scroll-mt-14 rounded-md border border-neutral-200 bg-white px-4 py-3"
      aria-labelledby="investigation-overview-heading"
      data-testid="investigation-overview"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="investigation-overview-heading"
            className="text-sm font-semibold text-neutral-900"
          >
            调查概览
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            调查进度 · 非最终结论
          </p>
        </div>
        {onGoToReport ? (
          <ReportShortcut
            hasReport={hasReport}
            canWriteReport={canWriteReport}
            onGoToReport={onGoToReport}
          />
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 调查概览：风险 / 异常 / UNKNOWN / 待办 / 下一步一眼可见。
 * 消费 Server Investigation Progress DTO 的展示模型 + 前端派生计数。
 * 不运行 progress resolver；RESOLVED ≠ Human final conclusion。
 */
export function InvestigationProgressPanel({
  view,
  overviewStats,
  hasReport = false,
  canWriteReport = false,
  onGoToReport,
}: {
  view: InvestigationProgressPanelView;
  overviewStats: InvestigationOverviewStats;
  hasReport?: boolean;
  canWriteReport?: boolean;
  onGoToReport?: () => void;
}) {
  if (view.resolutionStatus === "RESOLUTION_UNAVAILABLE") {
    return (
      <OverviewShell
        hasReport={hasReport}
        canWriteReport={canWriteReport}
        onGoToReport={onGoToReport}
      >
        <p
          className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900"
          role="status"
          data-testid="investigation-progress-unavailable"
        >
          调查进度暂不可用。当前无法完成重新解析，请稍后刷新后继续核查；不得将当前状态视为已完成核查或全部已解决。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RiskStat suggestedRiskLevel={overviewStats.suggestedRiskLevel} />
          <StatCell
            label="技术异常"
            value={overviewStats.abnormalCount}
            onClick={() =>
              scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.analysis)
            }
            emphasize={overviewStats.abnormalCount > 0 ? "warn" : "muted"}
          />
          <StatCell
            label="信息不足"
            value={overviewStats.unknownCount}
            onClick={() =>
              scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.analysis)
            }
            emphasize={overviewStats.unknownCount > 0 ? "warn" : "muted"}
          />
          <StatCell
            label="待核查事项"
            value={overviewStats.pendingChecklistCount}
            onClick={() =>
              scrollToInvestigationSection(
                INVESTIGATION_SECTION_IDS.evidenceWorkspace,
              )
            }
            emphasize={
              overviewStats.pendingChecklistCount > 0 ? "warn" : "muted"
            }
          />
        </div>
        <NextStepBlock view={view} />
      </OverviewShell>
    );
  }

  return (
    <OverviewShell
      hasReport={hasReport}
      canWriteReport={canWriteReport}
      onGoToReport={onGoToReport}
    >
      <p className="mt-2 text-xs leading-5 text-neutral-600">{view.disclaimer}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RiskStat suggestedRiskLevel={overviewStats.suggestedRiskLevel} />
        <StatCell
          label="技术异常"
          value={overviewStats.abnormalCount}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.analysis)
          }
          emphasize={overviewStats.abnormalCount > 0 ? "warn" : "muted"}
        />
        <StatCell
          label="信息不足"
          value={overviewStats.unknownCount}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.analysis)
          }
          emphasize={overviewStats.unknownCount > 0 ? "warn" : "muted"}
        />
        <StatCell
          label="待核查事项"
          value={overviewStats.pendingChecklistCount}
          onClick={() =>
            scrollToInvestigationSection(
              INVESTIGATION_SECTION_IDS.evidenceWorkspace,
            )
          }
          emphasize={
            overviewStats.pendingChecklistCount > 0 ? "warn" : "muted"
          }
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCell
          label="待补充上下文"
          value={view.pendingContext}
          onClick={() =>
            scrollToInvestigationSection(
              INVESTIGATION_SECTION_IDS.businessContext,
            )
          }
          emphasize={view.pendingContext > 0 ? "warn" : "muted"}
        />
        <StatCell
          label="待收集证据"
          value={view.pendingEvidence}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.evidence)
          }
          emphasize={view.pendingEvidence > 0 ? "warn" : "muted"}
        />
        <StatCell
          label="待完成核查"
          value={view.pendingChecks}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.checklist)
          }
          emphasize={view.pendingChecks > 0 ? "warn" : "muted"}
        />
        <StatCell
          label="已解决"
          value={view.resolvedCount}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.checklist)
          }
          emphasize="neutral"
        />
      </div>

      <p
        className="mt-3 text-xs text-neutral-500"
        data-testid="investigation-progress-human-review-fact"
      >
        {view.humanReviewFactLabel}
      </p>

      <NextStepBlock view={view} />
    </OverviewShell>
  );
}
