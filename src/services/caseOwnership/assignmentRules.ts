/**
 * Case Ownership 业务规则（Permission 之上的第二层）。
 * Ownership ≠ ACL；不改变 CASE_READ 可见性。
 */

import type { UserRole } from "@/domain/auth";
import { isEligibleAssigneeRole } from "@/domain/caseOwnership";

export type AssignmentActor = {
  id: string;
  role: UserRole;
};

export type AssignmentTargetUser = {
  id: string;
  role: string | null;
  enabled: boolean;
  displayName: string;
  username: string;
};

export type AssignmentRuleResult =
  | { ok: true }
  | { ok: false; error: string; code: "FORBIDDEN" };

/**
 * ANALYST：仅未分配→自己；或自己负责→未分配。
 * ADMIN：任意 eligible / 未分配。
 */
export function validateActorAssignmentRule(input: {
  actor: AssignmentActor;
  currentAssignedToUserId: string | null;
  targetUserId: string | null;
}): AssignmentRuleResult {
  const { actor, currentAssignedToUserId, targetUserId } = input;

  if (actor.role === "ADMIN") {
    return { ok: true };
  }

  if (actor.role !== "ANALYST") {
    return { ok: false, error: "当前账号无权分配案件负责人", code: "FORBIDDEN" };
  }

  // claim unassigned → self
  if (currentAssignedToUserId == null && targetUserId === actor.id) {
    return { ok: true };
  }

  // release own → unassigned
  if (
    currentAssignedToUserId === actor.id &&
    targetUserId == null
  ) {
    return { ok: true };
  }

  if (currentAssignedToUserId != null && currentAssignedToUserId !== actor.id) {
    return {
      ok: false,
      error: "无权接手或释放他人负责的案件",
      code: "FORBIDDEN",
    };
  }

  if (targetUserId != null && targetUserId !== actor.id) {
    return {
      ok: false,
      error: "分析员只能将未分配案件接手给自己",
      code: "FORBIDDEN",
    };
  }

  return {
    ok: false,
    error: "无权执行此案件负责人变更",
    code: "FORBIDDEN",
  };
}

/** 指派目标：enabled ADMIN/ANALYST；释放（null）始终合法 */
export function validateAssignmentTarget(input: {
  targetUserId: string | null;
  targetUser: AssignmentTargetUser | null;
}): AssignmentRuleResult {
  if (input.targetUserId == null) {
    return { ok: true };
  }
  if (!input.targetUser) {
    return { ok: false, error: "指派目标用户不存在", code: "FORBIDDEN" };
  }
  if (input.targetUser.id !== input.targetUserId) {
    return { ok: false, error: "指派目标用户不存在", code: "FORBIDDEN" };
  }
  if (!input.targetUser.enabled) {
    return { ok: false, error: "不能指派已停用账号为案件负责人", code: "FORBIDDEN" };
  }
  if (!isEligibleAssigneeRole(input.targetUser.role)) {
    return {
      ok: false,
      error: "只能指派管理员或分析员为案件负责人",
      code: "FORBIDDEN",
    };
  }
  return { ok: true };
}
