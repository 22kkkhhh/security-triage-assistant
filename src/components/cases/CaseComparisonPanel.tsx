import Link from "next/link";
import {
  businessLegitimacyLabels,
  caseStatusLabels,
  evidenceConfidenceLabels,
  existenceStatusLabels,
  finalConclusionLabels,
  riskLevelLabels,
  verificationStatusLabels,
} from "@/domain/labels";
import type { CaseComparisonView } from "@/services/correlation/caseComparisonTypes";
import { COMPARISON_MISSING_LABEL } from "@/services/correlation/buildCaseComparison";
import {
  displayCaseListRisk,
  riskBadgeClass,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
import {
  COMPARISON_HISTORY_REVIEW_WARNING,
  COMPARISON_MISSING_DISPLAY,
  COMPARISON_SAFETY_DISCLAIMER,
  comparisonCategoryLabels,
  comparisonDiffFieldLabels,
  comparisonSharedFactLabels,
} from "./caseComparisonLabels";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import type { ObservationStatus, RiskLevel } from "@/domain/types";
import { actionClass } from "@/components/layout/pageChrome";

function displayValue(value: string | null): string {
  if (value == null) return COMPARISON_MISSING_DISPLAY;
  if (value in riskLevelLabels) {
    return riskLevelLabels[value as RiskLevel];
  }
  if (value in existenceStatusLabels) {
    return existenceStatusLabels[value as keyof typeof existenceStatusLabels];
  }
  if (value in verificationStatusLabels) {
    return verificationStatusLabels[
      value as keyof typeof verificationStatusLabels
    ];
  }
  if (value in businessLegitimacyLabels) {
    return businessLegitimacyLabels[
      value as keyof typeof businessLegitimacyLabels
    ];
  }
  if (value === "NORMAL" || value === "ABNORMAL" || value === "UNKNOWN") {
    const map: Record<ObservationStatus, string> = {
      NORMAL: "未见异常",
      ABNORMAL: "异常 / 可疑",
      UNKNOWN: "数据不足，暂无法判断",
    };
    return map[value];
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDateTimeForDisplay(value);
  }
  return value;
}

function riskCaptionForSide(
  side: "current" | "historical",
  humanRiskLevel: RiskLevel | null,
): string {
  if (side === "historical") return "历史风险";
  return humanRiskLevel ? "人工风险" : "系统建议";
}

function CaseColumnHeader({
  label,
  caseNumber,
  title,
  status,
  riskLabel,
  riskCaption,
}: {
  label: string;
  caseNumber: string;
  title: string;
  status: Parameters<typeof statusBadgeClass>[0];
  riskLabel: string;
  riskCaption: string;
}) {
  return (
    <div
      className="border border-neutral-200 bg-white px-3 py-3"
      data-testid={
        label === "当前案件" ? "compare-current-column" : "compare-historical-column"
      }
    >
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-slate-800">{caseNumber}</p>
      <p className="mt-0.5 text-sm font-medium text-neutral-900">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-xs ${statusBadgeClass(status)}`}
        >
          {caseStatusLabels[status]}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-xs ${riskBadgeClass(riskLabel)}`}
        >
          {riskCaption} {riskLabel}
        </span>
      </div>
    </div>
  );
}

function DiffRows({
  rows,
}: {
  rows: CaseComparisonView["differentFacts"];
}) {
  return (
    <ul className="mt-2 space-y-3" data-testid="compare-diff-mobile">
      {/* Desktop column headers */}
      <li
        className="hidden border-b border-neutral-200 pb-1 text-xs text-neutral-500 md:grid md:grid-cols-3 md:gap-3"
        aria-hidden
      >
        <span>字段</span>
        <span>当前案件</span>
        <span>历史案件</span>
      </li>
      {rows.map((row) => (
        <li
          key={row.fieldCode}
          className="border-b border-neutral-100 pb-3 last:border-0 md:grid md:grid-cols-3 md:gap-3 md:border-0 md:pb-2"
          data-testid="compare-diff-row"
          data-field-code={row.fieldCode}
        >
          <p className="text-sm font-medium text-neutral-800 md:font-normal md:text-neutral-700">
            {comparisonDiffFieldLabels[row.fieldCode]}
          </p>
          <div className="mt-1.5 md:mt-0">
            <p className="text-xs text-neutral-500 md:hidden">当前</p>
            <p className="break-all font-mono text-sm text-neutral-900">
              {displayValue(row.currentValue)}
            </p>
          </div>
          <div className="mt-1.5 md:mt-0">
            <p className="text-xs text-neutral-500 md:hidden">历史</p>
            <p className="break-all font-mono text-sm text-neutral-900">
              {displayValue(row.relatedValue)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 两案对比只读面板：无 autosave / 无写操作。
 */
export function CaseComparisonPanel({
  comparison,
}: {
  comparison: CaseComparisonView;
}) {
  const { current, related, sharedFacts, differentFacts, stronglyRelated } =
    comparison;

  const categories = [
    "ALERT",
    "IDENTITY",
    "NETWORK",
    "DATA",
    "BUSINESS",
  ] as const;

  return (
    <div className="space-y-6" data-testid="case-comparison-panel">
      <p
        className="border-l-2 border-amber-400 bg-amber-50/50 px-3 py-1.5 text-xs leading-5 text-amber-900"
        data-testid="compare-safety-disclaimer"
      >
        {COMPARISON_SAFETY_DISCLAIMER}
      </p>

      {comparison.sameCase ? (
        <p
          className="text-sm text-neutral-700"
          data-testid="compare-same-case-message"
        >
          不能将案件与自身进行对比。请返回案件工作台选择其他历史案件。
        </p>
      ) : null}

      {!comparison.sameCase && !stronglyRelated ? (
        <p
          className="text-sm text-neutral-700"
          data-testid="compare-not-strongly-related"
        >
          当前未发现符合历史关联规则的明确共同调查事实。以下仅为两边已记录事实的只读对比，不表示关联案件。
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CaseColumnHeader
          label="当前案件"
          caseNumber={current.caseNumber}
          title={current.title}
          status={current.status}
          riskLabel={displayCaseListRisk(
            current.humanRiskLevel,
            current.suggestedRiskLevel,
          )}
          riskCaption={riskCaptionForSide("current", current.humanRiskLevel)}
        />
        <div className="flex flex-col gap-1 md:contents">
          <p className="text-center text-xs text-neutral-400 md:hidden" aria-hidden>
            ↓
          </p>
          <CaseColumnHeader
            label="历史案件"
            caseNumber={related.caseNumber}
            title={related.title}
            status={related.status}
            riskLabel={displayCaseListRisk(
              related.humanRiskLevel,
              related.suggestedRiskLevel,
            )}
            riskCaption={riskCaptionForSide(
              "historical",
              related.humanRiskLevel,
            )}
          />
        </div>
      </div>

      {!comparison.sameCase ? (
        <>
          <section aria-labelledby="compare-shared-heading">
            <h2
              id="compare-shared-heading"
              className="text-base font-semibold text-neutral-900"
            >
              共同事实
              {sharedFacts.length > 0 ? (
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  · {sharedFacts.length}
                </span>
              ) : null}
            </h2>
            {sharedFacts.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">
                当前两侧没有可确定为相同的调查事实字段。
              </p>
            ) : (
              <ul
                className="mt-3 space-y-1.5 text-sm text-neutral-800"
                data-testid="compare-shared-facts"
              >
                {sharedFacts.map((fact) => (
                  <li
                    key={`${fact.code}:${fact.value}`}
                    data-testid="compare-shared-fact"
                    data-fact-code={fact.code}
                    className="flex flex-wrap gap-x-3 gap-y-0.5"
                  >
                    <span className="min-w-[5.5rem] text-neutral-500">
                      {comparisonSharedFactLabels[fact.code]}
                    </span>
                    <span className="font-mono break-all">
                      {displayValue(fact.value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="compare-diff-heading">
            <h2
              id="compare-diff-heading"
              className="text-sm font-semibold text-neutral-900"
            >
              关键事实
            </h2>
            <div className="mt-2 space-y-2" data-testid="compare-differences">
              {categories.map((category) => {
                const rows = differentFacts.filter(
                  (d) => d.category === category,
                );
                if (rows.length === 0) return null;
                return (
                  <details
                    key={category}
                    className="border-b border-neutral-100 pb-2"
                    data-testid="compare-diff-category"
                    data-category={category}
                  >
                    <summary className="cursor-pointer py-1.5 text-sm text-neutral-800">
                      {comparisonCategoryLabels[category]}
                      <span className="ml-2 font-normal text-neutral-500">
                        {rows.length} 项不同
                      </span>
                    </summary>
                    <DiffRows rows={rows} />
                  </details>
                );
              })}
              {differentFacts.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  当前没有可展示的字段差异（缺失对缺失不计入差异）。
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="compare-review-heading"
            data-testid="compare-review-state"
          >
            <h2
              id="compare-review-heading"
              className="text-sm font-semibold text-neutral-500"
            >
              研判参考
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              系统建议与历史结论仅供对照，不构成当前案件结论。
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 border-t border-neutral-100 pt-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-neutral-500">
                  当前系统建议
                </p>
                <p className="mt-1 text-sm text-neutral-800">
                  建议风险：
                  {current.suggestedRiskLevel
                    ? riskLevelLabels[current.suggestedRiskLevel]
                    : "暂无法评级"}
                </p>
                {current.suggestedAssessment ? (
                  <>
                    <p className="mt-1 text-sm text-neutral-700">
                      {current.suggestedAssessment.summary}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      证据完整度：
                      {
                        evidenceConfidenceLabels[
                          current.suggestedAssessment.evidenceConfidence
                        ]
                      }
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-neutral-600">暂缺信息</p>
                )}
                <p className="mt-3 text-xs font-medium text-neutral-500">
                  当前人工研判
                </p>
                <p className="mt-1 text-sm text-neutral-800">
                  {current.humanConclusion
                    ? finalConclusionLabels[current.humanConclusion]
                    : "（尚未确认）"}
                </p>
                <p className="mt-0.5 text-sm text-neutral-700">
                  人工风险：
                  {current.humanRiskLevel
                    ? riskLevelLabels[current.humanRiskLevel]
                    : "（尚未评定）"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500">
                  历史系统建议
                </p>
                <p className="mt-1 text-sm text-neutral-800">
                  建议风险：
                  {related.suggestedRiskLevel
                    ? riskLevelLabels[related.suggestedRiskLevel]
                    : "暂无法评级"}
                </p>
                {related.suggestedAssessment ? (
                  <p className="mt-1 text-sm text-neutral-700">
                    {related.suggestedAssessment.summary}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-neutral-600">暂缺信息</p>
                )}
                <p className="mt-3 text-xs font-medium text-neutral-500">
                  历史人工研判
                </p>
                <p
                  className="mt-1 border-l-2 border-amber-400 bg-amber-50/60 px-2 py-1.5 text-xs text-amber-900"
                  data-testid="compare-history-review-warning"
                >
                  {COMPARISON_HISTORY_REVIEW_WARNING}
                </p>
                <p className="mt-1 text-sm text-neutral-800">
                  {related.humanConclusion
                    ? finalConclusionLabels[related.humanConclusion]
                    : "（尚未确认）"}
                </p>
                <p className="mt-0.5 text-sm text-neutral-700">
                  人工风险：
                  {related.humanRiskLevel
                    ? riskLevelLabels[related.humanRiskLevel]
                    : "（尚未评定）"}
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <span className="sr-only" data-missing-label={COMPARISON_MISSING_LABEL}>
        {COMPARISON_MISSING_DISPLAY}
      </span>
    </div>
  );
}

export function CaseComparisonBackLink({
  currentCaseId,
}: {
  currentCaseId: string;
}) {
  return (
    <Link
      href={`/cases/${currentCaseId}`}
      className={actionClass.tertiary}
      data-testid="compare-back-to-current"
    >
      ← 返回当前案件
    </Link>
  );
}
