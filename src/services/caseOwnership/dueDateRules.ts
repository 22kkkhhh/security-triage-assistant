/**
 * Case 运营截止时间写入规则（Permission 之上的第二层）。
 * ANALYST：仅可修改自己负责的案件；ADMIN：任意案件。
 */

import type { UserRole } from "@/domain/auth";

export type DueDateActor = {
  id: string;
  role: UserRole;
};

export type DueDateRuleResult =
  | { ok: true }
  | { ok: false; error: string; code: "FORBIDDEN" };

/**
 * ANALYST：仅 assignedToUserId === actor.id。
 * ADMIN：任意 Case（含未分配）。
 * VIEWER / 其他：拒绝。
 */
export function validateActorDueDateRule(input: {
  actor: DueDateActor;
  currentAssignedToUserId: string | null;
}): DueDateRuleResult {
  const { actor, currentAssignedToUserId } = input;

  if (actor.role === "ADMIN") {
    return { ok: true };
  }

  if (actor.role !== "ANALYST") {
    return {
      ok: false,
      error: "当前账号无权修改案件截止时间",
      code: "FORBIDDEN",
    };
  }

  if (currentAssignedToUserId == null) {
    return {
      ok: false,
      error: "未分配案件不可设置截止时间，请先接手案件",
      code: "FORBIDDEN",
    };
  }

  if (currentAssignedToUserId !== actor.id) {
    return {
      ok: false,
      error: "只能修改自己负责案件的截止时间",
      code: "FORBIDDEN",
    };
  }

  return { ok: true };
}
