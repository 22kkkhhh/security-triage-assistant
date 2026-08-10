"use client";

import Link from "next/link";
import { caseStatusLabels } from "@/domain/labels";
import type { CaseStatus } from "@/domain/types";
import {
  displayCaseListRisk,
  riskBadgeClass,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
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

/**
 * 持久化案件工作台顶部栏：返回、案件信息、状态、保存反馈。
 * commandPending 与 Snapshot autosave 状态分离，避免语义命令飞行中误导为「已保存」。
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
  /** 语义命令飞行中（非 autosave domain state） */
  commandPending?: boolean;
  navigationError: string | null;
  canChangeStatus: boolean;
  readOnly?: boolean;
  onStatusChange: (status: CaseStatus) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const riskLabel = displayCaseListRisk(humanRiskLevel, suggestedRiskLevel);

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← 返回历史案件
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {readOnly ? (
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
              只读模式
            </span>
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
        <div>
          <div className="font-mono text-xs text-neutral-500">{caseNumber}</div>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">
            {title}
          </h1>
          {!readOnly ? (
            <p className="mt-1 text-xs text-neutral-500">
              最后保存：{formatSavedAt(saveState.lastSavedAt)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              可查看案件内容，但不能修改。
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-block rounded border px-2 py-0.5 text-xs ${riskBadgeClass(riskLabel)}`}
          >
            {riskLabel}
          </span>
          {canChangeStatus ? (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              案件状态
              <select
                value={status}
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
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <span>案件状态</span>
              <span
                className={`inline-block rounded border px-2 py-1 text-xs ${statusBadgeClass(status)}`}
              >
                {caseStatusLabels[status]}
              </span>
            </div>
          )}
        </div>
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
    </section>
  );
}
