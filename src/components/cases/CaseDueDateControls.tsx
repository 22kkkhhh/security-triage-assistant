"use client";

import { useState } from "react";
import type { UserRole } from "@/domain/auth";
import type { CaseStatus } from "@/domain/types";
import {
  dueAtFormValueToIso,
  dueAtIsoToFormValue,
  formatOperationalDueCompact,
} from "@/domain/caseDueDate";

/**
 * 案件运营截止时间控件（与 Ownership 独立 semantic command）。
 */
export function CaseDueDateControls({
  dueAt,
  status,
  currentUserId,
  currentUserRole,
  assignedToUserId,
  canWriteDueDate,
  commandPending = false,
  onSetDueAt,
}: {
  dueAt: string | null;
  status: CaseStatus;
  currentUserId: string;
  currentUserRole: UserRole;
  assignedToUserId: string | null;
  canWriteDueDate: boolean;
  commandPending?: boolean;
  onSetDueAt: (dueAtIso: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => dueAtIsoToFormValue(dueAt));
  const [syncedDueAt, setSyncedDueAt] = useState(dueAt);
  // prop → draft 同步：服务端成功写回后刷新表单，不在 effect 里 setState
  if (dueAt !== syncedDueAt) {
    setSyncedDueAt(dueAt);
    setDraft(dueAtIsoToFormValue(dueAt));
  }

  const isOwn =
    assignedToUserId != null && assignedToUserId === currentUserId;
  const isUnassigned = assignedToUserId == null;
  const canEdit =
    canWriteDueDate &&
    (currentUserRole === "ADMIN" ||
      (currentUserRole === "ANALYST" && isOwn));

  const compact = formatOperationalDueCompact({
    dueAt,
    status,
    now: new Date(),
  });

  if (!canEdit) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        data-testid="case-due-date"
      >
        <span className="text-xs font-medium text-neutral-500">截止时间</span>
        <span
          className="text-sm text-neutral-800"
          data-testid="case-due-date-label"
        >
          {compact}
        </span>
        {canWriteDueDate &&
        currentUserRole === "ANALYST" &&
        isUnassigned ? (
          <span
            className="text-xs text-neutral-500"
            data-testid="case-due-date-claim-hint"
          >
            接手案件后可设置截止时间
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="case-due-date"
    >
      <span className="text-xs font-medium text-neutral-500">截止时间</span>
      <label className="flex items-center gap-2">
        <span className="sr-only">截止时间</span>
        <input
          type="datetime-local"
          aria-label="截止时间"
          data-testid="case-due-date-input"
          value={draft}
          disabled={commandPending}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800"
        />
      </label>
      <button
        type="button"
        data-testid="case-due-date-update"
        disabled={commandPending || !draft.trim()}
        onClick={() => {
          const iso = dueAtFormValueToIso(draft);
          if (!iso) return;
          onSetDueAt(iso);
        }}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        更新
      </button>
      <button
        type="button"
        data-testid="case-due-date-clear"
        disabled={commandPending || dueAt == null}
        onClick={() => onSetDueAt(null)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        清除
      </button>
      <span
        className="text-xs text-neutral-500"
        data-testid="case-due-date-label"
      >
        {compact}
      </span>
    </div>
  );
}
