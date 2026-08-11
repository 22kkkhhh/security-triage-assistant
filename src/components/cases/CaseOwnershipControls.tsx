"use client";

import type { UserRole } from "@/domain/auth";
import {
  formatCaseAssigneeLabel,
  type CaseAssigneeSummary,
  type CaseOwnership,
} from "@/domain/caseOwnership";

/**
 * 案件负责人控件（运营归属，≠ 业务负责人 / HumanReview reviewer）。
 */
export function CaseOwnershipControls({
  ownership,
  currentUserId,
  currentUserRole,
  canAssign,
  commandPending = false,
  eligibleAssignees = [],
  onAssign,
}: {
  ownership: CaseOwnership;
  currentUserId: string;
  currentUserRole: UserRole;
  canAssign: boolean;
  commandPending?: boolean;
  eligibleAssignees?: CaseAssigneeSummary[];
  onAssign: (targetUserId: string | null) => void;
}) {
  const assignedId = ownership.assignedToUserId;
  const isOwn = assignedId != null && assignedId === currentUserId;
  const isUnassigned = assignedId == null;
  const label = formatCaseAssigneeLabel(ownership.assignee, {
    currentUserId,
  });

  if (canAssign && currentUserRole === "ADMIN") {
    const selectValue = assignedId ?? "";
    const options = [...eligibleAssignees];
    // 当前负责人若已停用，仍需出现在 selector 中以便展示
    if (
      ownership.assignee &&
      !options.some((u) => u.id === ownership.assignee!.id)
    ) {
      options.unshift(ownership.assignee);
    }

    return (
      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        data-testid="case-ownership"
      >
        <span className="text-xs font-medium text-neutral-500">案件负责人</span>
        <label className="flex items-center gap-2">
          <span className="sr-only">案件负责人</span>
          <select
            aria-label="案件负责人"
            data-testid="case-ownership-admin-select"
            value={selectValue}
            disabled={commandPending}
            onChange={(e) => {
              const value = e.target.value;
              onAssign(value === "" ? null : value);
            }}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800"
          >
            <option value="">未分配</option>
            {options.map((user) => (
              <option key={user.id} value={user.id} disabled={!user.enabled}>
                {formatCaseAssigneeLabel(user)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="case-ownership"
    >
      <span className="text-xs font-medium text-neutral-500">案件负责人</span>
      <span
        className="text-sm text-neutral-800"
        data-testid="case-ownership-label"
      >
        {label}
      </span>
      {canAssign && currentUserRole === "ANALYST" && isUnassigned ? (
        <button
          type="button"
          data-testid="case-ownership-claim"
          disabled={commandPending}
          onClick={() => onAssign(currentUserId)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          接手案件
        </button>
      ) : null}
      {canAssign && currentUserRole === "ANALYST" && isOwn ? (
        <button
          type="button"
          data-testid="case-ownership-release"
          disabled={commandPending}
          onClick={() => onAssign(null)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          释放
        </button>
      ) : null}
    </div>
  );
}
