"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/domain/types";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { Panel } from "./common";

const eventTypeOptions = [
  "人工处置",
  "认证",
  "数据访问",
  "网络通信",
  "系统访问",
  "告警",
  "其他",
];

let humanEventSequence = 0;

/**
 * 事件时间线：查看系统事件 + 添加人工处置记录（仅前端 state）。
 */
export function TimelinePanel({
  events,
  onAdd,
}: {
  events: TimelineEvent[];
  onAdd: (event: TimelineEvent) => void;
}) {
  const [time, setTime] = useState("");
  const [operator, setOperator] = useState("");
  const [eventType, setEventType] = useState("人工处置");
  const [description, setDescription] = useState("");

  const sorted = [...events].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );

  const handleAdd = () => {
    if (!time || !description.trim()) return;
    humanEventSequence += 1;
    onAdd({
      id: `human-tl-${humanEventSequence}`,
      occurredAt: new Date(time).toISOString(),
      eventType,
      title: description.trim().slice(0, 20),
      description: description.trim(),
      operator: operator.trim() || null,
      source: "HUMAN",
    });
    setTime("");
    setOperator("");
    setDescription("");
  };

  return (
    <Panel title={`事件时间线（${sorted.length} 条）`}>
      {sorted.length === 0 && (
        <p className="text-sm text-neutral-500">
          暂无时间线记录，可在下方添加人工处置记录。
        </p>
      )}
      <ol className="relative space-y-3 border-l border-neutral-200 pl-4">
        {sorted.map((event) => (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
                event.source === "HUMAN" ? "bg-blue-500" : "bg-neutral-400"
              }`}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span className="font-mono">
                {formatDateTimeForDisplay(event.occurredAt)}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5">
                {event.eventType}
              </span>
              {event.source === "HUMAN" && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                  人工处置{event.operator ? ` · ${event.operator}` : ""}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm font-medium text-neutral-900">
              {event.title}
            </div>
            <p className="text-xs leading-5 text-neutral-600">
              {event.description}
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
        <div className="text-xs font-medium text-neutral-500">
          添加人工处置记录
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="datetime-local"
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <input
            className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm"
            value={operator}
            placeholder="操作人"
            onChange={(e) => setOperator(e.target.value)}
          />
          <select
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {eventTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
            value={description}
            placeholder="处置说明…"
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            disabled={!time || !description.trim()}
            onClick={handleAdd}
          >
            添加
          </button>
        </div>
      </div>
    </Panel>
  );
}
