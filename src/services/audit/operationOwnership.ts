/**
 * operationId 幂等 + Actor ownership 单一语义（v1.3 Step 5）。
 *
 * same operationId retry 仅当：
 * same trusted actor + same case + same actionType → alreadyApplied
 */

import type { AuditActionType } from "@/domain/audit";
import type { AuditActor } from "@/services/audit/auditEventBuilder";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";

/** 认证命令 / 系统命令允许的 Actor（禁止 MANUAL 默认路径） */
export type TrustedCommandActor =
  | { actorType: "USER"; actorId: string; actorName: string }
  | { actorType: "SYSTEM"; actorId: null; actorName: string };

export function assertTrustedCommandActor(
  actor: AuditActor,
): TrustedCommandActor {
  if (actor.actorType === "USER") {
    if (!actor.actorId?.trim()) {
      throw new Error("USER Actor 缺少 actorId");
    }
    if (!actor.actorName.trim()) {
      throw new Error("USER Actor 缺少 actorName");
    }
    return {
      actorType: "USER",
      actorId: actor.actorId,
      actorName: actor.actorName,
    };
  }
  if (actor.actorType === "SYSTEM") {
    return {
      actorType: "SYSTEM",
      actorId: null,
      actorName: actor.actorName.trim() || "系统",
    };
  }
  throw new Error("认证命令不得使用 MANUAL Actor");
}

export type OwnershipCheckResult =
  | { ok: true }
  | { ok: false; error: string; code: "FORBIDDEN" | "CONFLICT" };

/**
 * 已存在 operationId 时校验 ownership + resource + action。
 * ownership 失败 → FORBIDDEN（不暴露已应用结果）。
 */
export function validateOperationOwnership(input: {
  existing: Pick<
    CaseAuditLogView,
    "actorType" | "actorId" | "caseId" | "actionType"
  >;
  expectedActor: TrustedCommandActor;
  caseId: string;
  actionType: AuditActionType;
}): OwnershipCheckResult {
  const { existing, expectedActor, caseId, actionType } = input;

  if (expectedActor.actorType === "USER") {
    if (
      existing.actorType !== "USER" ||
      existing.actorId !== expectedActor.actorId
    ) {
      return {
        ok: false,
        error: "当前账号无权重放此操作",
        code: "FORBIDDEN",
      };
    }
  } else if (existing.actorType !== "SYSTEM") {
    return {
      ok: false,
      error: "当前账号无权重放此操作",
      code: "FORBIDDEN",
    };
  }

  if (existing.caseId !== caseId) {
    return {
      ok: false,
      error: "operationId 已被其他案件使用",
      code: "CONFLICT",
    };
  }

  if (existing.actionType !== actionType) {
    return {
      ok: false,
      error: "operationId 已被其他操作使用",
      code: "CONFLICT",
    };
  }

  return { ok: true };
}
