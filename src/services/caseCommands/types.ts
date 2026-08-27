import type { CaseStatus } from "@/domain/types";
import type { PersistedCase } from "@/services/persistence/types";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";

export type CommandOk = {
  ok: true;
  alreadyApplied: boolean;
  case: PersistedCase;
  audit: CaseAuditLogView | null;
};

export type CommandFail = {
  ok: false;
  error: string;
  code?: "STALE" | "FORBIDDEN" | "DUPLICATE_EXTERNAL_ALERT";
  existingCaseId?: string;
  existingCaseNumber?: string;
  /** STALE 时返回服务器当前 canonical case */
  case?: PersistedCase;
};

export type CommandResult = CommandOk | CommandFail;

/** Canonical BusinessContext semantic patch (structured fields only). */
export type {
  BusinessContextSemanticPatch,
  ChecklistAddSemanticIntent,
  TimelineEventSemanticIntent,
} from "./semanticCommandCanonicalization";

export const CASE_STATUSES: CaseStatus[] = [
  "NEW",
  "INVESTIGATING",
  "PENDING_VERIFICATION",
  "PENDING_BUSINESS_CONFIRMATION",
  "RESPONDING",
  "CLOSED",
];

export function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === "string" && CASE_STATUSES.includes(value as CaseStatus);
}

export function staleCommandResult(
  current: PersistedCase | null,
  fallbackError = "案件已发生更新，已刷新到最新状态。",
): CommandFail {
  if (!current) {
    return { ok: false, error: "案件不存在" };
  }
  return {
    ok: false,
    error: fallbackError,
    code: "STALE",
    case: current,
  };
}

export function requireBaseUpdatedAt(
  baseUpdatedAt: unknown,
): string | CommandFail {
  if (typeof baseUpdatedAt !== "string" || !baseUpdatedAt.trim()) {
    return { ok: false, error: "baseUpdatedAt 无效" };
  }
  return baseUpdatedAt.trim();
}
