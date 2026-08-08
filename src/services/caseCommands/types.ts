import type { CaseStatus } from "@/domain/types";
import type { PersistedCase, SaveCaseStateInput } from "@/services/persistence/types";
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
};

export type CommandResult = CommandOk | CommandFail;

/** 客户端提交的完整下一状态（canonical） */
export type NextCaseStateInput = SaveCaseStateInput;

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
