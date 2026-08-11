"use client";

import type { ReactNode } from "react";
import { resolveCaseNextStep } from "./caseNextStep";
import type { InvestigationOverviewStats } from "./investigationOverviewStats";
import type { InvestigationProgressPanelView } from "./investigationProgressSummary";
import {
  INVESTIGATION_SECTION_IDS,
  scrollToInvestigationSection,
} from "./investigationProgressSummary";

function CompactMetric({
  label,
  value,
  onClick,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  onClick?: () => void;
  emphasize?: boolean;
}) {
  const valueClass = emphasize ? "text-amber-800" : "text-neutral-700";
  const content = (
    <>
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 py-1.5">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full items-baseline justify-between gap-2 border-b border-neutral-100 py-1.5 text-left hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function NextStepBlock({ view }: { view: InvestigationProgressPanelView }) {
  const step = resolveCaseNextStep(view);

  return (
    <div
      className={
        step.isUnavailable
          ? "rounded border border-amber-200 bg-amber-50 px-3 py-3"
          : "rounded border border-slate-300 bg-white px-3 py-3"
      }
      data-testid="case-next-step"
    >
      <p className="text-xs font-medium text-neutral-600">建议下一步</p>
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={
              step.isUnavailable
                ? "text-base font-semibold text-amber-900"
                : "text-base font-semibold text-neutral-900"
            }
          >
            {step.title}
          </p>
          {!step.isUnavailable && (
            <p className="mt-1 text-sm text-neutral-600">{step.detail}</p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded bg-slate-800 px-3.5 py-2 text-sm text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          data-testid="case-next-step-cta"
          onClick={() => scrollToInvestigationSection(step.targetId)}
        >
          {step.ctaLabel === "去处理" ? "立即处理" : step.ctaLabel}
        </button>
      </div>
    </div>
  );
}

/** 关键发现：仅复用已有 runtime 计数，最多 3 条 */
export function deriveKeyFindings(input: {
  relatedCaseCount: number;
  abnormalCount: number;
  unknownCount: number;
  pendingChecklistCount: number;
}): string[] {
  const findings: string[] = [];
  if (input.relatedCaseCount > 0) {
    findings.push(`发现 ${input.relatedCaseCount} 个相关历史案件`);
  }
  if (input.abnormalCount > 0) {
    findings.push(`当前存在 ${input.abnormalCount} 项技术异常`);
  }
  if (input.unknownCount > 0) {
    findings.push(`仍有 ${input.unknownCount} 项信息不足`);
  }
  if (input.pendingChecklistCount > 0 && findings.length < 3) {
    findings.push(`有 ${input.pendingChecklistCount} 项待核查事项`);
  }
  return findings.slice(0, 3);
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
        data-testid="overview-report-cta"
        className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
        onClick={onGoToReport}
      >
        {canWriteReport ? "编辑报告" : "查看报告"}
      </button>
    );
  }

  if (canWriteReport) {
    return (
      <button
        type="button"
        data-testid="overview-report-cta"
        className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
        onClick={onGoToReport}
      >
        生成报告
      </button>
    );
  }

  return null;
}

/**
 * 概览：Next Step 优先；最多 3 个紧凑指标；风险已迁入 Header。
 */
export function InvestigationProgressPanel({
  view,
  overviewStats,
  relatedCaseCount = 0,
  hasReport = false,
  canWriteReport = false,
  onGoToReport,
}: {
  view: InvestigationProgressPanelView;
  overviewStats: InvestigationOverviewStats;
  relatedCaseCount?: number;
  hasReport?: boolean;
  canWriteReport?: boolean;
  onGoToReport?: () => void;
}) {
  const keyFindings = deriveKeyFindings({
    relatedCaseCount,
    abnormalCount: overviewStats.abnormalCount,
    unknownCount: overviewStats.unknownCount,
    pendingChecklistCount: overviewStats.pendingChecklistCount,
  });

  return (
    <section
      id={INVESTIGATION_SECTION_IDS.progress}
      className="scroll-mt-14 space-y-3"
      aria-labelledby="investigation-overview-heading"
      data-testid="investigation-overview"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="investigation-overview-heading"
            className="text-sm font-semibold text-neutral-900"
          >
            概览
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            当前情况与优先动作 · 非最终结论
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

      {view.resolutionStatus === "RESOLUTION_UNAVAILABLE" ? (
        <p
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900"
          role="status"
          data-testid="investigation-progress-unavailable"
        >
          调查进度暂不可用。当前无法完成重新解析，请稍后刷新后继续核查；不得将当前状态视为已完成核查或全部已解决。
        </p>
      ) : null}

      <NextStepBlock view={view} />

      <div
        className="max-w-md space-y-0"
        data-testid="overview-primary-metrics"
      >
        <CompactMetric
          label="技术异常"
          value={overviewStats.abnormalCount}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.analysis)
          }
          emphasize={overviewStats.abnormalCount > 0}
        />
        <CompactMetric
          label="信息不足"
          value={overviewStats.unknownCount}
          onClick={() =>
            scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.analysis)
          }
          emphasize={overviewStats.unknownCount > 0}
        />
        <CompactMetric
          label="待处理"
          value={overviewStats.pendingChecklistCount}
          onClick={() =>
            scrollToInvestigationSection(
              INVESTIGATION_SECTION_IDS.evidenceWorkspace,
            )
          }
          emphasize={overviewStats.pendingChecklistCount > 0}
        />
      </div>

      {view.resolutionStatus === "SUCCESS" ? (
        <p
          className="text-xs text-neutral-500"
          data-testid="overview-progress-line"
        >
          调查进度：已完成 {view.resolvedCount} · 待处理{" "}
          {view.pendingChecks + view.pendingContext + view.pendingEvidence}
        </p>
      ) : null}

      {keyFindings.length > 0 ? (
        <div data-testid="overview-key-findings">
          <p className="text-xs font-medium text-neutral-600">关键发现</p>
          <ul className="mt-1 space-y-0.5 text-sm text-neutral-800">
            {keyFindings.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.resolutionStatus === "SUCCESS" ? (
        <p
          className="text-xs text-neutral-500"
          data-testid="investigation-progress-human-review-fact"
        >
          {view.humanReviewFactLabel}
        </p>
      ) : null}
    </section>
  );
}
