"use client";

import { useState } from "react";
import { securityDomainLabels } from "@/domain/labels";
import type { ChecklistItem, SecurityDomain } from "@/domain/types";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { groupChecklistItemsForDisplay } from "./checklistGrouping";
import { Panel } from "./common";

function ChecklistItemRow({
  item,
  canWrite,
  canEditNote,
  onToggle,
  onEditNote,
  onDelete,
  showSystemRuleBadge,
  compactRuleHint,
}: {
  item: ChecklistItem;
  canWrite: boolean;
  canEditNote: boolean;
  onToggle: (id: string) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  /** 单项 SYSTEM 仍展示「系统生成 · ruleId」；group child 用次要提示 */
  showSystemRuleBadge: boolean;
  compactRuleHint: boolean;
}) {
  return (
    <li className="flex items-start gap-2 rounded border border-neutral-100 px-3 py-2">
      {canWrite ? (
        <input
          type="checkbox"
          className="mt-1"
          checked={item.completed}
          onChange={() => onToggle(item.id)}
          aria-label={`${item.label}（${item.completed ? "已完成" : "未完成"}）`}
        />
      ) : (
        <span
          className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-300 text-[10px] text-neutral-500"
          aria-label={item.completed ? "已完成" : "未完成"}
          title={item.completed ? "已完成" : "未完成"}
        >
          {item.completed ? "✓" : ""}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm ${
              item.completed
                ? "text-neutral-400 line-through"
                : "text-neutral-900"
            }`}
          >
            {item.label}
          </span>
          <span className="text-xs text-neutral-400">
            {securityDomainLabels[item.category]}
          </span>
          {item.origin === "SYSTEM" ? (
            showSystemRuleBadge ? (
              <span className="text-[11px] text-neutral-400">
                系统 · {item.relatedRuleId}
              </span>
            ) : compactRuleHint && item.relatedRuleId ? (
              <span className="text-[11px] text-neutral-400">
                规则 {item.relatedRuleId}
              </span>
            ) : null
          ) : item.sourceKind === "KNOWLEDGE_SUGGESTED" ? (
            <span className="text-[11px] text-neutral-400">合规建议</span>
          ) : item.sourceKind === "INVESTIGATION_LEAD" ? (
            <span
              className="text-[11px] text-neutral-400"
              data-testid="checklist-badge-investigation-lead"
            >
              历史线索
            </span>
          ) : (
            <span className="text-[11px] text-neutral-400">人工新增</span>
          )}
        </div>
        {canEditNote ? (
          <input
            className="mt-1 w-full rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-700"
            value={item.note ?? ""}
            placeholder="备注（可编辑）"
            onChange={(e) => onEditNote(item.id, e.target.value)}
          />
        ) : (
          <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-100 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-700">
            {item.note?.trim() ? item.note : "（无备注）"}
          </p>
        )}
      </div>
      {canWrite && item.origin === "MANUAL" && (
        <button
          type="button"
          className="shrink-0 rounded px-2 py-0.5 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600"
          onClick={() => onDelete(item.id)}
        >
          删除
        </button>
      )}
    </li>
  );
}

function SystemChecklistGroup({
  label,
  category,
  items,
  canWrite,
  canEditNote,
  onToggle,
  onEditNote,
  onDelete,
}: {
  label: string;
  category: SecurityDomain;
  items: ChecklistItem[];
  canWrite: boolean;
  canEditNote: boolean;
  onToggle: (id: string) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = items.length;
  const completedCount = items.filter((i) => i.completed).length;

  return (
    <li className="rounded border border-neutral-200 bg-neutral-50/40 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-neutral-900">{label}</span>
            <span className="text-xs text-neutral-400">
              {securityDomainLabels[category]}
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
              系统核查 · {total} 项
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            {completedCount} / {total} 已完成
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-slate-700 underline underline-offset-2"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起明细" : "展开明细"}
        </button>
      </div>
      {expanded ? (
        <ul className="mt-2 space-y-1.5 border-t border-neutral-200 pt-2">
          {items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              canWrite={canWrite}
              canEditNote={canEditNote}
              onToggle={onToggle}
              onEditNote={onEditNote}
              onDelete={onDelete}
              showSystemRuleBadge={false}
              compactRuleHint
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * 待核查事项：完成 / 编辑 / 新增 / 删除受 canWrite / canEditNote 控制（UX）。
 * SYSTEM 同 category + 同 label 仅做展示分组；完成仍按具体 item.id。
 */
export function ChecklistPanel({
  items,
  onToggle,
  onEditNote,
  onDelete,
  onAdd,
  canWrite = true,
  canEditNote = true,
}: {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onAdd: (item: ChecklistItem) => void;
  canWrite?: boolean;
  canEditNote?: boolean;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<SecurityDomain>("BUSINESS");

  const handleAdd = () => {
    if (!canWrite) return;
    const label = newLabel.trim();
    if (!label) return;
    onAdd(createManualChecklistItem({ category: newCategory, label }));
    setNewLabel("");
  };

  const displayEntries = groupChecklistItemsForDisplay(items);

  return (
    <Panel title={`待核查事项（${items.filter((i) => !i.completed).length} 项未完成）`}>
      <ul className="space-y-1.5">
        {displayEntries.map((entry) =>
          entry.kind === "single" ? (
            <ChecklistItemRow
              key={entry.item.id}
              item={entry.item}
              canWrite={canWrite}
              canEditNote={canEditNote}
              onToggle={onToggle}
              onEditNote={onEditNote}
              onDelete={onDelete}
              showSystemRuleBadge={entry.item.origin === "SYSTEM"}
              compactRuleHint={false}
            />
          ) : (
            <SystemChecklistGroup
              key={entry.key}
              label={entry.label}
              category={entry.category}
              items={entry.items}
              canWrite={canWrite}
              canEditNote={canEditNote}
              onToggle={onToggle}
              onEditNote={onEditNote}
              onDelete={onDelete}
            />
          ),
        )}
        {items.length === 0 && (
          <li className="text-sm text-neutral-500">暂无待核查事项。</li>
        )}
      </ul>
      {canWrite ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
          <select
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as SecurityDomain)}
          >
            {Object.entries(securityDomainLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
            value={newLabel}
            placeholder="人工新增核查事项…"
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <button
            type="button"
            className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700"
            onClick={handleAdd}
          >
            新增
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
