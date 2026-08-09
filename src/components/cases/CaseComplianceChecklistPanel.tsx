"use client";

import { useState } from "react";
import { Panel } from "@/components/common";
import type {
  CaseComplianceChecklistItem,
  CaseComplianceChecklistView,
} from "@/services/knowledge/caseComplianceChecklist";
import {
  CASE_COMPLIANCE_CHECKLIST_DISCLAIMER,
} from "@/services/knowledge/caseComplianceChecklist";
import { formatCaseComplianceRelevanceLabel } from "@/services/knowledge/caseCompliancePanel";

function ChecklistRow({
  item,
  alreadyAdded,
  canWrite,
  adding,
  onAdd,
}: {
  item: CaseComplianceChecklistItem;
  alreadyAdded: boolean;
  canWrite: boolean;
  adding: boolean;
  onAdd: (item: CaseComplianceChecklistItem) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded border border-neutral-200 bg-neutral-50/40 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-900">{item.label}</p>
          {item.description && (
            <p className="mt-0.5 text-xs leading-5 text-neutral-600">
              {item.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {alreadyAdded ? (
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
              已加入
            </span>
          ) : canWrite ? (
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              disabled={adding}
              onClick={() => onAdd(item)}
            >
              {adding ? "加入中…" : "加入核查清单"}
            </button>
          ) : null}
          <button
            type="button"
            className="text-xs text-slate-700 underline underline-offset-2"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起依据" : "依据"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 text-xs leading-5 text-neutral-700">
          <p>
            <span className="text-neutral-500">关联程度：</span>
            {formatCaseComplianceRelevanceLabel(item.relevance)}
          </p>
          <p>
            <span className="text-neutral-500">关联控制：</span>
            {item.controlCodes.join("、") || "（无）"}
          </p>
          <p>
            <span className="text-neutral-500">条款：</span>
            {item.clauseRefs.length > 0
              ? item.clauseRefs
                  .map((r) => `${r.documentCanonicalCode}/${r.clauseKey}`)
                  .join("、")
              : "（无）"}
          </p>
          <p>
            <span className="text-neutral-500">关系类型：</span>
            {item.relationTypes.join("、") || "（无）"}
          </p>
          <div className="rounded border border-dashed border-neutral-300 bg-white px-2 py-1.5">
            <p className="font-medium text-neutral-800">审计信息</p>
            <p className="mt-0.5">
              <span className="text-neutral-500">规则：</span>
              {item.ruleIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-500">supportingRuleIds：</span>
              {item.supportingRuleIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-500">evidenceIds：</span>
              {item.evidenceIds.join("、") || "（无）"}
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * 「建议核查事项」：展示服务端聚合视图；可 opt-in 加入现有 Case Checklist。
 */
export function CaseComplianceChecklistPanel({
  view,
  addedSuggestionKeys,
  canWrite = false,
  pendingSuggestionKey = null,
  onAddSuggestion,
}: {
  view: CaseComplianceChecklistView;
  /** 已在 Case Checklist 中的 suggestionKey 集合 */
  addedSuggestionKeys: ReadonlySet<string>;
  canWrite?: boolean;
  pendingSuggestionKey?: string | null;
  onAddSuggestion?: (item: CaseComplianceChecklistItem) => void;
}) {
  return (
    <Panel
      title="建议核查事项"
      extra={
        !view.empty ? (
          <span className="text-xs text-neutral-500">{view.totalCount} 项</span>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs leading-5 text-neutral-600">
        {CASE_COMPLIANCE_CHECKLIST_DISCLAIMER}
      </p>

      {view.empty ? (
        <p className="text-sm text-neutral-500">当前暂无额外合规核查事项</p>
      ) : (
        <div className="space-y-4">
          {view.groups.map((group) => (
            <section key={group.kind} aria-label={group.title}>
              <h3 className="mb-2 text-xs font-semibold text-neutral-800">
                {group.title}
                <span className="ml-1 font-normal text-neutral-500">
                  （{group.items.length}）
                </span>
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <ChecklistRow
                    key={item.key}
                    item={item}
                    alreadyAdded={addedSuggestionKeys.has(item.key)}
                    canWrite={canWrite && Boolean(onAddSuggestion)}
                    adding={pendingSuggestionKey === item.key}
                    onAdd={(suggestion) => onAddSuggestion?.(suggestion)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
