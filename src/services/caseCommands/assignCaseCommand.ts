/**
 * 案件负责人分配 Semantic Command（v1.11 M1）。
 * 更新 CaseRecord ownership 列 + Audit；不修改 caseState / HumanReview。
 */

import type { UserRole } from "@/domain/auth";
import {
  buildCaseAssignedAudit,
  buildCaseUnassignedAudit,
  type AuditActor,
} from "@/services/audit/auditEventBuilder";
import {
  assertTrustedCommandActor,
  validateOperationOwnership,
  type TrustedCommandActor,
} from "@/services/audit/operationOwnership";
import {
  appendCaseAudit,
  findAuditByOperationId,
  runInTransaction,
} from "@/services/persistence/auditRepository";
import {
  assignCaseOwnershipIfVersionMatches,
  getCaseById,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";
import {
  validateActorAssignmentRule,
  validateAssignmentTarget,
} from "@/services/caseOwnership/assignmentRules";
import { getAssignableUserById } from "@/services/caseOwnership/eligibleAssignees";
import {
  COMMAND_ERROR_MESSAGES,
  resolveCommandErrorMessage,
} from "./commandErrorBoundary";
import { requireBaseUpdatedAt, staleCommandResult, type CommandResult } from "./types";

function requireActor(actor: AuditActor): TrustedCommandActor | CommandResult {
  try {
    return assertTrustedCommandActor(actor);
  } catch (error) {
    return {
      ok: false,
      error: resolveCommandErrorMessage(
        error,
        COMMAND_ERROR_MESSAGES.actorInvalid,
      ),
    };
  }
}

async function resolveAssignOperationId(input: {
  caseId: string;
  operationId: string;
  actor: TrustedCommandActor;
  actionType: "CASE_ASSIGNED" | "CASE_UNASSIGNED";
}): Promise<CommandResult | null> {
  const existing = await findAuditByOperationId(input.operationId);
  if (!existing) return null;

  const ownership = validateOperationOwnership({
    existing,
    expectedActor: input.actor,
    caseId: input.caseId,
    actionType: input.actionType,
  });
  if (!ownership.ok) {
    return {
      ok: false,
      error: ownership.error,
      code: ownership.code === "FORBIDDEN" ? "FORBIDDEN" : undefined,
    };
  }

  const record = await getCaseById(input.caseId);
  if (!record) return { ok: false, error: "案件不存在" };
  return {
    ok: true,
    alreadyApplied: true,
    case: record,
    audit: existing,
  };
}

/**
 * 分配 / 重分配 / 释放案件负责人。
 * actorRole 必须来自可信 AuthUser（Server Authorization 之后）。
 */
export async function assignCaseCommand(input: {
  caseId: string;
  targetUserId: string | null;
  operationId: string;
  baseUpdatedAt: string;
  actor: AuditActor;
  actorRole: UserRole;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  if (trusted.actorType !== "USER" || !trusted.actorId) {
    return { ok: false, error: "案件负责人变更需要认证用户", code: "FORBIDDEN" };
  }

  if (!input.operationId?.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const operationId = input.operationId.trim();
  const actionType =
    input.targetUserId == null ? "CASE_UNASSIGNED" : "CASE_ASSIGNED";

  const idempotent = await resolveAssignOperationId({
    caseId: input.caseId,
    operationId,
    actor: trusted,
    actionType,
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const currentAssignedToUserId = existing.ownership.assignedToUserId;
  const nextTargetUserId = input.targetUserId;

  // semantic no-op：同一负责人再次指派
  if (currentAssignedToUserId === nextTargetUserId) {
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  const actorRule = validateActorAssignmentRule({
    actor: { id: trusted.actorId, role: input.actorRole },
    currentAssignedToUserId,
    targetUserId: nextTargetUserId,
  });
  if (!actorRule.ok) {
    return { ok: false, error: actorRule.error, code: actorRule.code };
  }

  const targetUser =
    nextTargetUserId == null
      ? null
      : await getAssignableUserById(nextTargetUserId);
  const targetRule = validateAssignmentTarget({
    targetUserId: nextTargetUserId,
    targetUser,
  });
  if (!targetRule.ok) {
    return { ok: false, error: targetRule.error, code: targetRule.code };
  }

  const previousName =
    existing.ownership.assignee?.displayName ??
    existing.ownership.assignee?.username ??
    null;
  const newName =
    targetUser?.displayName ?? targetUser?.username ?? null;

  const built =
    nextTargetUserId == null
      ? buildCaseUnassignedAudit({
          previousAssigneeUserId: currentAssignedToUserId,
          previousAssigneeName: previousName,
          actor: trusted,
          operationId,
        })
      : buildCaseAssignedAudit({
          previousAssigneeUserId: currentAssignedToUserId,
          previousAssigneeName: previousName,
          newAssigneeUserId: nextTargetUserId,
          newAssigneeName: newName,
          actor: trusted,
          operationId,
          isSelfClaim:
            currentAssignedToUserId == null &&
            nextTargetUserId === trusted.actorId,
          isAdminReassign:
            input.actorRole === "ADMIN" &&
            currentAssignedToUserId != null &&
            nextTargetUserId !== currentAssignedToUserId,
        });

  try {
    const audit = await runInTransaction(async (tx) => {
      await assignCaseOwnershipIfVersionMatches(
        input.caseId,
        {
          assignedToUserId: nextTargetUserId,
          assignedAt: nextTargetUserId ? new Date() : null,
        },
        base,
        tx,
      );
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...built,
        },
        tx,
      );
    });
    const saved = await getCaseById(input.caseId);
    if (!saved) return { ok: false, error: "案件不存在" };
    return {
      ok: true,
      alreadyApplied: false,
      case: saved,
      audit,
    };
  } catch (error) {
    if (error instanceof StaleCaseStateError) {
      const current =
        error.currentCase ?? (await getCaseById(input.caseId));
      return staleCommandResult(current, error.message);
    }
    return {
      ok: false,
      error: resolveCommandErrorMessage(
        error,
        COMMAND_ERROR_MESSAGES.caseUpdate,
      ),
    };
  }
}
