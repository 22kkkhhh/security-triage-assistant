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

function displayValue(value: string | null): string {
  if (value == null) return COMPARISON_MISSING_DISPLAY;
  // Domain enum → 中文（能匹配则替换）
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
  // ISO-ish timestamps
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDateTimeForDisplay(value);
  }
  return value;
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
      className="rounded border border-neutral-200 bg-neutral-50 px-3 py-3"
      data-testid={
        label === "当前案件" ? "compare-current-column" : "compare-historical-column"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
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
          {riskCaption}：{riskLabel}
        </span>
      </div>
    </div>
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
        className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
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
          riskCaption="当前建议/人工风险"
        />
        <CaseColumnHeader
          label="历史案件"
          caseNumber={related.caseNumber}
          title={related.title}
          status={related.status}
          riskLabel={displayCaseListRisk(
            related.humanRiskLevel,
            related.suggestedRiskLevel,
          )}
          riskCaption="历史风险"
        />
      </div>

      {!comparison.sameCase ? (
        <>
          <section aria-labelledby="compare-shared-heading">
            <h2
              id="compare-shared-heading"
              className="text-sm font-semibold text-neutral-900"
            >
              共同调查事实
            </h2>
            {sharedFacts.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">
                当前两侧没有可确定为相同的调查事实字段。
              </p>
            ) : (
              <ul
                className="mt-2 space-y-1 text-sm text-neutral-800"
                data-testid="compare-shared-facts"
              >
                {sharedFacts.map((fact) => (
                  <li
                    key={`${fact.code}:${fact.value}`}
                    data-testid="compare-shared-fact"
                    data-fact-code={fact.code}
                  >
                    · {comparisonSharedFactLabels[fact.code]}{" "}
                    <span className="font-mono">{displayValue(fact.value)}</span>
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
              关键事实对比
            </h2>
            <div className="mt-3 space-y-4" data-testid="compare-differences">
              {categories.map((category) => {
                const rows = differentFacts.filter(
                  (d) => d.category === category,
                );
                if (rows.length === 0) return null;
                return (
                  <div key={category}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {comparisonCategoryLabels[category]}
                    </h3>
                    <div className="mt-1.5 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                            <th className="py-1.5 pr-3 font-medium">字段</th>
                            <th className="py-1.5 pr-3 font-medium">当前案件</th>
                            <th className="py-1.5 font-medium">历史案件</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr
                              key={row.fieldCode}
                              className="border-b border-neutral-100"
                              data-testid="compare-diff-row"
                              data-field-code={row.fieldCode}
                            >
                              <td className="py-1.5 pr-3 text-neutral-700">
                                {comparisonDiffFieldLabels[row.fieldCode]}
                              </td>
                              <td className="py-1.5 pr-3 font-mono text-neutral-900">
                                {displayValue(row.currentValue)}
                              </td>
                              <td className="py-1.5 font-mono text-neutral-900">
                                {displayValue(row.relatedValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
              className="text-sm font-semibold text-neutral-900"
            >
              研判状态
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded border border-neutral-200 px-3 py-3">
                <p className="text-xs font-semibold text-neutral-500">
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
                <p className="mt-3 text-xs font-semibold text-neutral-500">
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

              <div className="rounded border border-neutral-200 px-3 py-3">
                <p className="text-xs font-semibold text-neutral-500">
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
                <p className="mt-3 text-xs font-semibold text-neutral-500">
                  历史人工研判
                </p>
                <p
                  className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
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

      {/* 断言用：确认未使用禁止措辞常量 */}
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
      className="text-sm font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
      data-testid="compare-back-to-current"
    >
      ← 返回当前案件
    </Link>
  );
}
