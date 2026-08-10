"use client";

import Link from "next/link";
import { caseStatusLabels } from "@/domain/labels";
import { RELATED_CASES_WINDOW_DAYS } from "@/services/correlation/types";
import type { InvestigationIntelligenceView } from "@/services/correlation/investigationIntelligenceTypes";
import {
  displayCaseListRisk,
  riskBadgeClass,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { formatRelatedCaseReason } from "./relatedCaseLabels";
import {
  formatHistoricalSignal,
  formatInvestigationLead,
} from "./investigationIntelligenceLabels";
import {
  INVESTIGATION_SECTION_IDS,
  scrollToInvestigationSection,
} from "./investigationProgressSummary";

/**
 * 历史调查线索：Historical Signals + Investigation Leads + Related Cases。
 * 只读辅助；不改研判 / Checklist / Progress；不继承历史结论。
 */
export function RelatedCasesPanel({
  intelligence,
}: {
  intelligence: InvestigationIntelligenceView;
}) {
  const { relatedCases, relatedCaseCount, signals, leads } = intelligence;
  const relatedListId = "related-cases-list-anchor";

  return (
    <section
      id={INVESTIGATION_SECTION_IDS.historicalLeads}
      className="scroll-mt-14 rounded-md border border-neutral-200 bg-white px-4 py-3"
      aria-labelledby="historical-leads-heading"
      data-testid="related-cases-panel"
    >
      <div className="border-b border-neutral-100 pb-2">
        <h2
          id="historical-leads-heading"
          className="text-sm font-semibold text-neutral-900"
        >
          历史调查线索
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          基于明确共同调查事实的只读参考 · 不表示同一安全事件 · 不自动提升当前风险
        </p>
      </div>

      {relatedCaseCount === 0 ? (
        <p
          className="mt-3 text-sm text-neutral-600"
          data-testid="related-cases-empty"
        >
          当前未发现具有明确共同调查事实的历史案件。
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <p
            className="text-sm text-neutral-700"
            data-testid="historical-related-count"
          >
            过去 {RELATED_CASES_WINDOW_DAYS} 天发现 {relatedCaseCount}{" "}
            个相关案件
          </p>

          {signals.length > 0 ? (
            <div data-testid="historical-signals">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                重复事实
              </h3>
              <ul className="mt-1.5 space-y-1 text-sm text-neutral-800">
                {signals.map((signal) => (
                  <li
                    key={`${signal.code}:${signal.value}`}
                    data-testid="historical-signal-item"
                    data-signal-code={signal.code}
                  >
                    · {formatHistoricalSignal(signal.code)}{" "}
                    <span className="font-mono text-neutral-900">
                      {signal.value}
                    </span>{" "}
                    · {signal.relatedCaseCount} 个案件
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {leads.length > 0 ? (
            <div data-testid="investigation-leads">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                建议核查
              </h3>
              <ul className="mt-1.5 space-y-1 text-sm text-neutral-800">
                {leads.map((lead) => (
                  <li
                    key={lead.code}
                    data-testid="investigation-lead-item"
                    data-lead-code={lead.code}
                  >
                    · {formatInvestigationLead(lead.code)}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  data-testid="cta-view-related-cases"
                  onClick={() => {
                    document
                      .getElementById(relatedListId)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  查看关联案件
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  data-testid="cta-view-evidence"
                  onClick={() =>
                    scrollToInvestigationSection(
                      INVESTIGATION_SECTION_IDS.evidence,
                    )
                  }
                >
                  查看证据
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  data-testid="cta-view-business-context"
                  onClick={() =>
                    scrollToInvestigationSection(
                      INVESTIGATION_SECTION_IDS.businessContext,
                    )
                  }
                >
                  查看业务上下文
                </button>
              </div>
            </div>
          ) : null}

          <div id={relatedListId} className="scroll-mt-14">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              关联案件
            </h3>
            <ul className="mt-1.5 space-y-3" data-testid="related-cases-list">
              {relatedCases.map((item) => {
                const riskLabel = displayCaseListRisk(
                  item.humanRiskLevel,
                  item.suggestedRiskLevel,
                );
                return (
                  <li
                    key={item.caseId}
                    className="rounded border border-neutral-200 px-3 py-2.5"
                    data-testid="related-case-item"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/cases/${item.caseId}`}
                          className="font-mono text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                          data-testid="related-case-link"
                        >
                          {item.caseNumber}
                        </Link>
                        <p className="mt-0.5 text-sm font-medium text-neutral-900">
                          {item.title}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-xs ${statusBadgeClass(item.status)}`}
                        >
                          {caseStatusLabels[item.status]}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-xs ${riskBadgeClass(riskLabel)}`}
                        >
                          {riskLabel}
                        </span>
                      </div>
                    </div>

                    <ul className="mt-2 space-y-0.5 text-xs text-neutral-700">
                      {item.reasons.map((reason) => (
                        <li key={`${reason.code}:${reason.value}`}>
                          · {formatRelatedCaseReason(reason.code)}{" "}
                          <span className="font-mono text-neutral-800">
                            {reason.value}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <p className="mt-2 text-xs text-neutral-500">
                      最近活动：{formatDateTimeForDisplay(item.lastActivityAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
