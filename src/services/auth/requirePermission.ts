/**
 * Server Authorization helper（v1.3 Step 4）。
 *
 * Authentication → DB User reload → enabled → Permission → business logic。
 * Permission SoT 仍为 src/domain/auth.ts。
 */

import {
  authorize,
  ForbiddenError,
  UnauthenticatedError,
  type AuthUser,
  type Permission,
} from "@/domain/auth";
import { requireAuthenticatedUser } from "@/services/auth/currentUser";
import { resolveVitestAuthOverride } from "@/services/auth/testAuthContext";

/**
 * Server Action / Page 统一授权入口。
 * 必须在 parse payload / operationId / OCC / mutation 之前调用。
 */
export async function requirePermission(
  permission: Permission,
  incomingHeaders?: Headers,
): Promise<AuthUser> {
  const override = resolveVitestAuthOverride();
  if (override?.kind === "unauthenticated") {
    throw new UnauthenticatedError();
  }
  if (override?.kind === "user") {
    return authorize(override.user, permission);
  }

  const user = await requireAuthenticatedUser(incomingHeaders);
  return authorize(user, permission);
}

export type AuthActionFailure = {
  ok: false;
  error: string;
  code: "UNAUTHENTICATED" | "FORBIDDEN";
};

/** 将 Auth 错误序列化为 Client 可识别的 Action 结果（无 stack / 内部细节） */
export function toAuthActionFailure(error: unknown): AuthActionFailure {
  if (error instanceof UnauthenticatedError) {
    return {
      ok: false,
      error: "登录状态已失效，请重新登录",
      code: "UNAUTHENTICATED",
    };
  }
  if (error instanceof ForbiddenError) {
    return {
      ok: false,
      error: "当前账号无权限执行此操作",
      code: "FORBIDDEN",
    };
  }
  throw error;
}

/**
 * Server Action → Permission 合同表（测试覆盖用）。
 * 新增写/读 Action 时必须在此登记。
 */
export const SERVER_ACTION_PERMISSIONS = {
  saveCaseStateAction: "CASE_SNAPSHOT_WRITE",
  createCaseAction: "CASE_CREATE",
  changeCaseStatusAction: "CASE_STATUS_CHANGE",
  applyChecklistCommandAction: "CHECKLIST_WRITE",
  addInvestigationLeadToChecklistAction: "CHECKLIST_WRITE",
  updateBusinessContextAction: "BUSINESS_CONTEXT_WRITE",
  updateHumanReviewAction: "HUMAN_REVIEW_WRITE",
  addTimelineEventAction: "TIMELINE_WRITE",
  addHandoffNoteAction: "HANDOFF_WRITE",
  loadMoreCaseAuditLogsAction: "ACTIVITY_READ",
  createReportDraftAction: "REPORT_WRITE",
  saveReportDraftAction: "REPORT_WRITE",
  exportReportAction: "REPORT_EXPORT",
  listUsersAction: "USER_ADMIN",
  createUserAction: "USER_ADMIN",
  updateDisplayNameAction: "USER_ADMIN",
  changeRoleAction: "USER_ADMIN",
  setEnabledAction: "USER_ADMIN",
  retryRevokeSessionsAction: "USER_ADMIN",
  adminResetPasswordAction: "PASSWORD_ADMIN_RESET",
  changeOwnPasswordAction: "PASSWORD_SELF_CHANGE",
} as const satisfies Record<string, Permission>;

export const SERVER_PAGE_PERMISSIONS = {
  "/cases": "CASE_READ",
  "/cases/[id]": "CASE_READ",
  "/cases/[id]/activity": "ACTIVITY_READ",
  "/cases/new": "CASE_CREATE",
  "/cases/[id]/report": "REPORT_READ",
  "/reports": "REPORT_READ",
  "/admin/users": "USER_ADMIN",
  "/account": "PASSWORD_SELF_CHANGE",
} as const satisfies Record<string, Permission>;
