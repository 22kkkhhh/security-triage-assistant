import { evidenceSourceTypeLabels } from "@/domain/labels";
import type { Evidence } from "@/domain/types";
import { Panel } from "./common";

/**
 * 证据中心：展示脱敏后的证据摘要与关联规则，
 * 不展示大量原始敏感日志。
 */
export function EvidencePanel({ evidences }: { evidences: Evidence[] }) {
  return (
    <Panel title={`证据中心（${evidences.length} 条）`}>
      {evidences.length === 0 ? (
        <p className="text-sm text-neutral-500">暂无证据。</p>
      ) : (
        <ul className="space-y-2">
          {evidences.map((evidence) => (
            <li
              key={evidence.evidenceId}
              className="rounded border border-neutral-100 bg-neutral-50 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span className="font-mono">{evidence.evidenceId}</span>
                <span>{evidenceSourceTypeLabels[evidence.sourceType]}</span>
                <span>{evidence.timestamp ?? "（无时间）"}</span>
                <span className="rounded bg-neutral-200 px-1.5 py-0.5">
                  关联规则 {evidence.relatedRuleId}
                </span>
              </div>
              <div className="mt-1 text-sm font-medium text-neutral-900">
                {evidence.title}
              </div>
              <p className="mt-0.5 text-xs leading-5 text-neutral-600">
                {evidence.summary}
              </p>
              {evidence.analystNote && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  研判备注：{evidence.analystNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
