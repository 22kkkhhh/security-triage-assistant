"use client";

import { useState } from "react";
import { securityDomainLabels } from "@/domain/labels";
import type { ChecklistItem, SecurityDomain } from "@/domain/types";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { Panel } from "./common";

/**
 * 待核查事项：浏览器 state 交互（完成 / 编辑 / 新增 / 删除），
 * 系统生成与人工新增在视觉上区分。刷新后状态丢失（本阶段可接受）。
 */
export function ChecklistPanel({
  items,
  onToggle,
  onEditNote,
  onDelete,
  onAdd,
}: {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onEditNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onAdd: (item: ChecklistItem) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<SecurityDomain>("BUSINESS");

  const handleAdd = () => {
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
            <input
              type="checkbox"
              className="mt-1"
              checked={item.completed}
              onChange={() => onToggle(item.id)}
            />
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
                ) : (
                  <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
                    人工新增
                  </span>
                )}
              </div>
              <input
                className="mt-1 w-full rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-700"
                value={item.note ?? ""}
                placeholder="备注（可编辑）"
                onChange={(e) => onEditNote(item.id, e.target.value)}
              />
            </div>
            {item.origin === "MANUAL" && (
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
    </Panel>
  );
}
