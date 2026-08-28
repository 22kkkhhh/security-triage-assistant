import Link from "next/link";
import { evidenceSourceTypeLabels } from "@/domain/labels";
import type { Evidence } from "@/domain/types";
import { formatDateTimeForDisplay, formatDateTimesInDisplayText } from "@/lib/formatDateTimeForDisplay";
import { Panel } from "./common";

export function EvidencePanel({ evidences, pinnedEvidenceIds = [], onTogglePin, caseId }: { evidences: Evidence[]; pinnedEvidenceIds?: string[]; onTogglePin?: (id: string) => void; caseId?: string }) {
  return <Panel title={`证据中心（${evidences.length} 条）`}>
    {evidences.length === 0 ? <p className="text-sm text-neutral-500">暂无证据。</p> : <ul className="space-y-2">{evidences.map((evidence) => {
      const pinned = pinnedEvidenceIds.includes(evidence.evidenceId);
      return <li key={evidence.evidenceId} className={`rounded-[var(--ui-radius-input)] border px-3 py-2 ${pinned ? "border-blue-300 bg-blue-50/40" : "border-[var(--ui-border-subtle)] bg-[var(--ui-surface-secondary)]"}`} data-testid="evidence-row">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500"><span className="font-mono">{evidence.evidenceId}</span><span>{evidenceSourceTypeLabels[evidence.sourceType]}</span><span>{evidence.timestamp ? formatDateTimeForDisplay(evidence.timestamp) : "（无时间）"}</span><span className="rounded bg-neutral-200 px-1.5 py-0.5">关联规则 {evidence.relatedRuleId}</span>{pinned ? <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700">关键证据</span> : null}</div>
        <div className="mt-1 break-words text-sm font-medium text-[var(--ui-text-primary)]">{evidence.title}</div><p className="mt-0.5 break-words text-xs leading-5 text-[var(--ui-text-secondary)]">{formatDateTimesInDisplayText(evidence.summary)}</p>{evidence.analystNote ? <p className="mt-0.5 text-xs text-neutral-500">研判备注：{evidence.analystNote}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">{onTogglePin ? <button type="button" className="rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" onClick={() => onTogglePin(evidence.evidenceId)} aria-pressed={pinned}>{pinned ? "取消关键证据" : "标记为关键证据"}</button> : null}{evidence.rawAlertId ? <Link href={`/raw-alerts/${evidence.rawAlertId}${caseId ? `?fromCase=${encodeURIComponent(caseId)}` : ""}`} className="rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white" data-testid="evidence-source-link">查看来源</Link> : <span className="text-xs text-neutral-400">来源不可用</span>}</div>
      </li>;
    })}</ul>}
  </Panel>;
}
