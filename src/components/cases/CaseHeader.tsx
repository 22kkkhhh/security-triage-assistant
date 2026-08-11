"use client";

import Link from "next/link";
import type { UserRole } from "@/domain/auth";
import type {
  CaseAssigneeSummary,
  CaseOwnership,
} from "@/domain/caseOwnership";
import { caseStatusLabels, riskLevelLabels } from "@/domain/labels";
import type { CaseStatus } from "@/domain/types";
import { statusBadgeClass } from "@/components/cases/caseDisplay";
import { CaseDueDateControls } from "@/components/cases/CaseDueDateControls";
import { CaseOwnershipControls } from "@/components/cases/CaseOwnershipControls";
import type { AutosaveState } from "@/hooks/autosaveState";
import type { RiskLevel } from "@/domain/types";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";

function formatSavedAt(iso: string | null): string {
  if (!iso) return "—";
  return formatDateTimeForDisplay(iso);
}

function saveStatusLabel(state: AutosaveState): string {
  switch (state.status) {
    case "SAVING":
    case "DIRTY":
      return state.status === "SAVING" ? "保存中…" : "待保存…";
    case "SAVED":
      return `已保存 ${formatSavedAt(state.lastSavedAt).slice(11)}`;
    case "ERROR":
      return "保存失败";
    default:
      return "已同步";
  }
}

/** Header 风险文案：明确来源，不把系统建议伪装成人工结论 */
export function formatHeaderRiskLabel(
  humanRiskLevel: RiskLevel | null,
  suggestedRiskLevel: RiskLevel | null,
): string {
  if (humanRiskLevel) {
    return `人工风险 ${riskLevelLabels[humanRiskLevel]}`;
  }
  if (suggestedRiskLevel) {
    return `系统建议 ${riskLevelLabels[suggestedRiskLevel]}`;
  }
  return "暂无法评级";
}

function headerRiskClass(humanRiskLevel: RiskLevel | null, label: string): string {
  if (label === "暂无法评级") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  const level = humanRiskLevel;
  const text = level ? riskLevelLabels[level] : label.replace(/^系统建议\s*/, "");
  if (text === "严重" || text === "高风险") {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (text === "中风险") {
    return "border-orange-300 bg-orange-50 text-orange-700";
  }
  if (text === "低风险") {
    return "border-green-300 bg-green-50 text-green-700";
  }
  return "border-neutral-300 bg-neutral-50 text-neutral-600";
}

/**
 * 持久化案件工作台顶部栏：返回、案件标识、状态、风险来源、保存反馈。
 */
export function CaseHeader({
  caseNumber,
  title,
  status,
  humanRiskLevel,
  suggestedRiskLevel,
  saveState,
  commandPending = false,
  navigationError,
  canChangeStatus,
  readOnly = false,
  ownership,
  currentUserId,
  currentUserRole,
  canAssignCase,
  canWriteDueDate,
  dueAt,
  eligibleAssignees = [],
  onAssign,
  onSetDueAt,
  onStatusChange,
  onRetry,
  onBack,
}: {
  caseNumber: string;
  title: string;
  status: CaseStatus;
  humanRiskLevel: RiskLevel | null;
  suggestedRiskLevel: RiskLevel | null;
  saveState: AutosaveState;
  commandPending?: boolean;
  navigationError: string | null;
  canChangeStatus: boolean;
  readOnly?: boolean;
  ownership: CaseOwnership;
  dueAt: string | null;
  currentUserId: string;
  currentUserRole: UserRole;
  canAssignCase: boolean;
  canWriteDueDate: boolean;
  eligibleAssignees?: CaseAssigneeSummary[];
  onAssign: (targetUserId: string | null) => void;
  onSetDueAt: (dueAtIso: string | null) => void;
  onStatusChange: (status: CaseStatus) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const riskLabel = formatHeaderRiskLabel(humanRiskLevel, suggestedRiskLevel);

  return (
    <header className="space-y-3 border-b border-neutral-200 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← 返回案件
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {readOnly ? (
            <span className="text-xs text-slate-600">只读模式</span>
          ) : (
            <>
              <span
                className={
                  commandPending
                    ? "text-amber-700"
                    : saveState.status === "ERROR"
                      ? "text-red-700"
                      : "text-neutral-500"
                }
              >
                {commandPending ? "处理中…" : saveStatusLabel(saveState)}
              </span>
              {!commandPending && saveState.status === "ERROR" && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                >
                  重试
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-neutral-500">{caseNumber}</div>
          <h1 className="mt-0.5 text-xl font-semibold text-neutral-900">
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canChangeStatus ? (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <span className="sr-only">案件状态</span>
              <select
                value={status}
                aria-label="案件状态"
                onChange={(e) => onStatusChange(e.target.value as CaseStatus)}
                disabled={commandPending}
                className={`rounded border px-2 py-1 text-xs ${statusBadgeClass(status)}`}
              >
                {(
                  Object.entries(caseStatusLabels) as [CaseStatus, string][]
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span
              className={`inline-block rounded border px-2 py-1 text-xs ${statusBadgeClass(status)}`}
            >
              {caseStatusLabels[status]}
            </span>
          )}
          <span
            className={`inline-block rounded border px-2 py-1 text-xs ${headerRiskClass(humanRiskLevel, riskLabel)}`}
            data-testid="case-header-risk"
          >
            {riskLabel}
          </span>
        </div>
      </div>

      <div
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2"
        data-testid="case-operational-meta"
      >
        <CaseOwnershipControls
          ownership={ownership}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          canAssign={canAssignCase}
          commandPending={commandPending}
          eligibleAssignees={eligibleAssignees}
          onAssign={onAssign}
        />
        <CaseDueDateControls
          dueAt={dueAt}
          status={status}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          assignedToUserId={ownership.assignedToUserId}
          canWriteDueDate={canWriteDueDate}
          commandPending={commandPending}
          onSetDueAt={onSetDueAt}
        />
      </div>

      {navigationError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {navigationError}{" "}
          <button
            type="button"
            onClick={onRetry}
            className="underline underline-offset-2"
          >
            重试
          </button>
          <Link href="/cases" className="ml-3 text-neutral-600 underline">
            仍要离开
          </Link>
        </div>
      )}
    </header>
  );
}
