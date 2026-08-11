/**
 * 案件运营截止时间 Semantic Command（v1.11 M2）。
 * 更新 CaseRecord.dueAt + Audit；不修改 caseState / ownership / HumanReview。
 */

import type { UserRole } from "@/domain/auth";
import { parseDueAtInput } from "@/domain/caseDueDate";
import {
  buildCaseDueDateChangedAudit,
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
  getCaseById,
  setCaseDueAtIfVersionMatches,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";
import { validateActorDueDateRule } from "@/services/caseOwnership/dueDateRules";
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

async function resolveDueAtOperationId(input: {
  caseId: string;
  operationId: string;
  actor: TrustedCommandActor;
}): Promise<CommandResult | null> {
  const existing = await findAuditByOperationId(input.operationId);
  if (!existing) return null;

  const ownership = validateOperationOwnership({
    existing,
    expectedActor: input.actor,
    caseId: input.caseId,
    actionType: "CASE_DUE_DATE_CHANGED",
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

function sameDueAt(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

/**
 * 设置 / 修改 / 清除案件运营截止时间。
 * actorRole 必须来自可信 AuthUser（Server Authorization 之后）。
 */
export async function setCaseDueAtCommand(input: {
  caseId: string;
  dueAtIso: string | null;
  operationId: string;
  baseUpdatedAt: string;
  actor: AuditActor;
  actorRole: UserRole;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  if (trusted.actorType !== "USER" || !trusted.actorId) {
    return { ok: false, error: "截止时间变更需要认证用户", code: "FORBIDDEN" };
  }

  if (!input.operationId?.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const operationId = input.operationId.trim();

  const parsed = parseDueAtInput(input.dueAtIso);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    return { ok: false, error: parsed.error };
  }
  const nextDueAt = parsed as string | null;

  const idempotent = await resolveDueAtOperationId({
    caseId: input.caseId,
    operationId,
    actor: trusted,
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  // 先做版本校验：ownership 等并发变更后，旧页提交应 STALE，而非按新状态误判 FORBIDDEN
  if (existing.updatedAt !== base) {
    return staleCommandResult(
      existing,
      "案件已发生更新，已刷新到最新状态。",
    );
  }

  const previousDueAt = existing.dueAt;

  // semantic no-op：新 dueAt 与当前完全相同
  if (sameDueAt(previousDueAt, nextDueAt)) {
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  const actorRule = validateActorDueDateRule({
    actor: { id: trusted.actorId, role: input.actorRole },
    currentAssignedToUserId: existing.ownership.assignedToUserId,
  });
  if (!actorRule.ok) {
    return { ok: false, error: actorRule.error, code: actorRule.code };
  }

  const actorName = trusted.actorName?.trim() || "用户";
  const built = buildCaseDueDateChangedAudit({
    previousDueAt,
    newDueAt: nextDueAt,
    actorName,
    actor: trusted,
    operationId,
  });

  try {
    const audit = await runInTransaction(async (tx) => {
      await setCaseDueAtIfVersionMatches(
        input.caseId,
        {
          dueAt: nextDueAt ? new Date(nextDueAt) : null,
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
