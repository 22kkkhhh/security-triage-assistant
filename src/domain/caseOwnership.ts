/**
 * Case Ownership 领域类型与展示辅助（v1.11 M1）。
 *
 * Ownership = 运营责任，不是 Case ACL / 可见性边界。
 * SoT：CaseRecord.assignedToUserId（禁止写入 caseState）。
 */

import type { UserRole } from "@/domain/auth";

/** 案件队列 scope（GET ?scope=） */
export type CaseQueueScope = "all" | "mine" | "unassigned";

export const CASE_QUEUE_SCOPES: readonly CaseQueueScope[] = [
  "all",
  "mine",
  "unassigned",
] as const;

/** 可被指派为案件负责人的角色 */
export const CASE_ASSIGNEE_ELIGIBLE_ROLES: readonly UserRole[] = [
  "ADMIN",
  "ANALYST",
] as const;

/** 负责人最小展示 DTO（不含 password / email / session） */
export type CaseAssigneeSummary = {
  id: string;
  displayName: string;
  username: string;
  role: UserRole;
  enabled: boolean;
};

/** 案件运营归属（canonical） */
export type CaseOwnership = {
  assignedToUserId: string | null;
  assignedAt: string | null;
  assignee: CaseAssigneeSummary | null;
};

export function isCaseQueueScope(value: string | undefined): value is CaseQueueScope {
  return (
    value === "all" || value === "mine" || value === "unassigned"
  );
}

export function isEligibleAssigneeRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "ANALYST";
}

/** UI：负责人展示文案（含已停用标注） */
export function formatCaseAssigneeLabel(
  assignee: CaseAssigneeSummary | null | undefined,
  options?: { currentUserId?: string | null },
): string {
  if (!assignee) return "未分配";
  const isSelf =
    options?.currentUserId != null && options.currentUserId === assignee.id;
  const base = isSelf ? "我" : assignee.displayName || assignee.username;
  return assignee.enabled ? base : `${base}（已停用）`;
}

export function emptyCaseOwnership(): CaseOwnership {
  return {
    assignedToUserId: null,
    assignedAt: null,
    assignee: null,
  };
}
