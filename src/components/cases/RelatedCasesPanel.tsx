"use client";

import Link from "next/link";
import { caseStatusLabels } from "@/domain/labels";
import type { RelatedCaseItem } from "@/services/correlation/types";
import {
  displayCaseListRisk,
  riskBadgeClass,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { formatRelatedCaseReason } from "./relatedCaseLabels";

/**
 * 关联历史案件：只读辅助信息，不改研判 / Checklist / Progress。
 */
export function RelatedCasesPanel({
  items,
}: {
  items: RelatedCaseItem[];
}) {
  return (
    <section
      className="scroll-mt-14 rounded-md border border-neutral-200 bg-white px-4 py-3"
      aria-labelledby="related-cases-heading"
      data-testid="related-cases-panel"
    >
      <div className="border-b border-neutral-100 pb-2">
        <h2
          id="related-cases-heading"
          className="text-sm font-semibold text-neutral-900"
        >
          关联历史案件
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          基于明确共同调查事实的只读参考 · 不表示同一安全事件
        </p>
      </div>

      {items.length === 0 ? (
        <p
          className="mt-3 text-sm text-neutral-600"
          data-testid="related-cases-empty"
        >
          当前未发现具有明确共同调查事实的历史案件。
        </p>
      ) : (
        <ul className="mt-3 space-y-3" data-testid="related-cases-list">
          {items.map((item) => {
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
      )}
    </section>
  );
}
