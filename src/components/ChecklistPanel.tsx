"use client";

import { useState } from "react";
import { securityDomainLabels } from "@/domain/labels";
import type { ChecklistItem, SecurityDomain } from "@/domain/types";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { Panel } from "./common";

/**
 * 待核查事项：完成 / 编辑 / 新增 / 删除受 canWrite / canEditNote 控制（UX）。
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

  return (
    <Panel title={`待核查事项（${items.filter((i) => !i.completed).length} 项未完成）`}>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded border border-neutral-100 px-3 py-2"
          >
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
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                    系统生成 · {item.relatedRuleId}
                  </span>
                ) : item.sourceKind === "KNOWLEDGE_SUGGESTED" ? (
                  <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-800">
                    合规建议
                  </span>
                ) : (
                  <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
                    人工新增
                  </span>
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
        ))}
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
