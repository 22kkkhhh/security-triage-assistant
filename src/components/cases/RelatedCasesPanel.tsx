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
 * 历史调查线索：默认 compact 摘要；展开后保留 Signals / Leads / Related / Compare。
 * 只读辅助；不改研判 / Checklist / Progress；不继承历史结论。
 */
export function RelatedCasesPanel({
  intelligence,
  currentCaseId,
  canWriteChecklist = false,
  acceptedLeadKeys = new Set<string>(),
  pendingLeadKey = null,
  onAddLeadToChecklist,
}: {
  intelligence: InvestigationIntelligenceView;
  currentCaseId: string;
  canWriteChecklist?: boolean;
  acceptedLeadKeys?: ReadonlySet<string>;
  pendingLeadKey?: string | null;
  onAddLeadToChecklist?: (leadCode: string) => void;
}) {
  const { relatedCases, relatedCaseCount, signals, leads } = intelligence;
  const relatedListId = "related-cases-list-anchor";
  const previewSignals = signals.slice(0, 3);

  if (relatedCaseCount === 0) {
    return (
      <section
        id={INVESTIGATION_SECTION_IDS.historicalLeads}
        className="scroll-mt-14"
        aria-labelledby="historical-leads-heading"
        data-testid="related-cases-panel"
      >
        <h3
          id="historical-leads-heading"
          className="text-sm font-semibold text-neutral-900"
        >
          历史线索
        </h3>
        <p
          className="mt-1 text-sm text-neutral-600"
          data-testid="related-cases-empty"
        >
          暂未发现具有明确共同调查事实的历史案件。
        </p>
      </section>
    );
  }

  return (
    <section
      id={INVESTIGATION_SECTION_IDS.historicalLeads}
      className="scroll-mt-14"
      aria-labelledby="historical-leads-heading"
      data-testid="related-cases-panel"
    >
      <details data-testid="historical-leads-details">
        <summary
          className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          data-testid="historical-leads-expand"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                id="historical-leads-heading"
                className="text-sm font-semibold text-neutral-900"
              >
                历史线索
              </h3>
              <p
                className="mt-1 text-sm text-neutral-700"
                data-testid="historical-related-count"
              >
                发现 {relatedCaseCount} 个可能相关历史案件
                <span className="text-neutral-500">
                  （过去 {RELATED_CASES_WINDOW_DAYS} 天）
                </span>
              </p>
              {previewSignals.length > 0 ? (
                <ul
                  className="mt-1.5 space-y-0.5 text-sm text-neutral-700"
                  data-testid="historical-signals-preview"
                >
                  {previewSignals.map((signal) => (
                    <li key={`preview:${signal.code}:${signal.value}`}>
                      · {formatHistoricalSignal(signal.code)} ·{" "}
                      {signal.relatedCaseCount} 个案件
                    </li>
                  ))}
                </ul>
              ) : null}
              {leads.length > 0 ? (
                <p className="mt-1 text-sm text-neutral-600">
                  {leads.length} 项建议核查
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-xs font-medium text-slate-700 underline underline-offset-2">
              展开历史线索
            </span>
          </div>
        </summary>

        <div className="mt-3 space-y-4 border-t border-neutral-100 pt-3">
          <p className="text-xs text-neutral-500">
            基于明确共同调查事实的只读参考 · 不表示同一安全事件 ·
            不自动提升当前风险
          </p>

          {signals.length > 0 ? (
            <div data-testid="historical-signals">
              <h4 className="text-xs font-medium text-neutral-500">重复事实</h4>
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
              <h4 className="text-xs font-medium text-neutral-500">建议核查</h4>
              <ul className="mt-1.5 space-y-2 text-sm text-neutral-800">
                {leads.map((lead) => {
                  const leadKey = `INVESTIGATION_LEAD:${lead.code}`;
                  const accepted = acceptedLeadKeys.has(leadKey);
                  const pending = pendingLeadKey === leadKey;
                  return (
                    <li
                      key={lead.code}
                      className="flex flex-wrap items-start justify-between gap-2"
                      data-testid="investigation-lead-item"
                      data-lead-code={lead.code}
                    >
                      <span>· {formatInvestigationLead(lead.code)}</span>
                      {canWriteChecklist ? (
                        accepted ? (
                          <span
                            className="shrink-0 text-xs font-medium text-emerald-700"
                            data-testid="investigation-lead-added"
                          >
                            已加入核查清单
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            data-testid="investigation-lead-add-button"
                            disabled={pending || Boolean(pendingLeadKey)}
                            onClick={() => onAddLeadToChecklist?.(lead.code)}
                          >
                            {pending ? "加入中…" : "加入核查清单"}
                          </button>
                        )
                      ) : null}
                    </li>
                  );
                })}
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
            <h4 className="text-xs font-medium text-neutral-500">关联案件</h4>
            <ul className="mt-1.5 space-y-3" data-testid="related-cases-list">
              {relatedCases.map((item) => {
                const riskLabel = displayCaseListRisk(
                  item.humanRiskLevel,
                  item.suggestedRiskLevel,
                );
                return (
                  <li
                    key={item.caseId}
                    className="border border-neutral-200 px-3 py-2.5"
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
                        <Link
                          href={`/cases/${currentCaseId}/compare/${item.caseId}`}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          data-testid="related-case-compare-link"
                        >
                          对比调查
                        </Link>
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
      </details>
    </section>
  );
}
