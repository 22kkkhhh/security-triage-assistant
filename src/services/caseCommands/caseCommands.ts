/**
 * 案件 Semantic Commands：业务状态更新 + Audit 同事务。
 * 与普通 saveCaseState autosave 路径分离；写入前校验 baseUpdatedAt。
 * Actor 必须由调用方显式传入（USER / SYSTEM）；禁止 reviewer 推导。
 */

import type { AuditActionType } from "@/domain/audit";
import type {
  BusinessContext,
  CaseStatus,
  FinalConclusion,
  RiskLevel,
} from "@/domain/types";
import {
  buildBusinessContextUpdatedAudit,
  buildCaseCreatedAudit,
  buildChecklistAddedAudit,
  buildChecklistCompletedAudit,
  buildChecklistDeletedAudit,
  buildChecklistReopenedAudit,
  buildHumanReviewUpdatedAudit,
  buildStatusChangedAudit,
  buildTimelineEventAddedAudit,
  type AuditActor,
  type BuiltAuditEvent,
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
  createCaseRecord,
  getCaseById,
  saveCaseStateIfVersionMatches,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";
import type {
  CreateCaseInput,
  PersistedCase,
  PersistedCaseState,
} from "@/services/persistence/types";
import {
  isCaseStatus,
  requireBaseUpdatedAt,
  staleCommandResult,
  type CommandResult,
  type NextCaseStateInput,
} from "./types";

const STRUCTURED_BC_FIELDS = [
  "plannedTaskStatus",
  "changeTicketStatus",
  "ownerVerification",
  "businessLegitimacy",
] as const;

async function resolveOperationId(input: {
  caseId: string;
  operationId: string | null | undefined;
  actor: TrustedCommandActor;
  actionType: AuditActionType;
}): Promise<CommandResult | null> {
  if (!input.operationId?.trim()) return null;
  const existing = await findAuditByOperationId(input.operationId.trim());
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

function asPersistedState(record: PersistedCase): PersistedCaseState {
  return record.caseState;
}

async function commitStateAndAudit(input: {
  caseId: string;
  baseUpdatedAt: string;
  nextCaseState: NextCaseStateInput;
  built: BuiltAuditEvent;
}): Promise<CommandResult> {
  try {
    const audit = await runInTransaction(async (tx) => {
      await saveCaseStateIfVersionMatches(
        input.caseId,
        input.nextCaseState,
        input.baseUpdatedAt,
        tx,
      );
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...input.built,
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
    const message =
      error instanceof Error ? error.message : "案件更新失败";
    return { ok: false, error: message };
  }
}

function requireActor(actor: AuditActor): TrustedCommandActor | CommandResult {
  try {
    return assertTrustedCommandActor(actor);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Actor 无效",
    };
  }
}

/** 创建案件 + CASE_CREATED（同事务；operationId 幂等 + ownership） */
export async function createCaseWithAudit(
  input: CreateCaseInput,
  options: {
    actor: AuditActor;
    sourceType?: string | null;
    operationId?: string | null;
  },
): Promise<CommandResult> {
  const actor = requireActor(options.actor);
  if ("ok" in actor && actor.ok === false) return actor;

  const trusted = actor as TrustedCommandActor;
  const operationId = options.operationId?.trim() || null;
  if (operationId) {
    const existing = await findAuditByOperationId(operationId);
    if (existing) {
      const ownership = validateOperationOwnership({
        existing,
        expectedActor: trusted,
        caseId: existing.caseId,
        actionType: "CASE_CREATED",
      });
      if (!ownership.ok) {
        return {
          ok: false,
          error: ownership.error,
          code: ownership.code === "FORBIDDEN" ? "FORBIDDEN" : undefined,
        };
      }
      const record = await getCaseById(existing.caseId);
      if (!record) return { ok: false, error: "案件不存在" };
      return {
        ok: true,
        alreadyApplied: true,
        case: record,
        audit: existing,
      };
    }
  }

  try {
    const created = await runInTransaction(async (tx) => {
      const row = await createCaseRecord(input, tx);
      const audit = await appendCaseAudit(
        {
          caseId: row.id,
          ...buildCaseCreatedAudit({
            caseNumber: row.caseNumber,
            title: row.title,
            sourceType: options.sourceType,
            operationId,
            actor: trusted,
          }),
        },
        tx,
      );
      return { row, audit };
    });

    const refreshed = await getCaseById(created.row.id);
    return {
      ok: true,
      alreadyApplied: false,
      case: refreshed ?? created.row,
      audit: created.audit,
    };
  } catch (error) {
    if (operationId) {
      const raced = await findAuditByOperationId(operationId);
      if (raced) {
        const ownership = validateOperationOwnership({
          existing: raced,
          expectedActor: trusted,
          caseId: raced.caseId,
          actionType: "CASE_CREATED",
        });
        if (ownership.ok) {
          const record = await getCaseById(raced.caseId);
          if (record) {
            return {
              ok: true,
              alreadyApplied: true,
              case: record,
              audit: raced,
            };
          }
        }
      }
    }
    const message = error instanceof Error ? error.message : "案件创建失败";
    return { ok: false, error: message };
  }
}

/** 修改案件状态 */
export async function changeCaseStatusCommand(input: {
  caseId: string;
  nextStatus: CaseStatus;
  operationId: string;
  nextCaseState: NextCaseStateInput;
  baseUpdatedAt: string;
  actor: AuditActor;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  if (!isCaseStatus(input.nextStatus)) {
    return { ok: false, error: "案件状态无效" };
  }
  const idempotent = await resolveOperationId({
    caseId: input.caseId,
    operationId: input.operationId,
    actor: trusted,
    actionType: "STATUS_CHANGED",
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const oldStatus = existing.status;
  if (oldStatus === input.nextStatus) {
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  return commitStateAndAudit({
    caseId: input.caseId,
    baseUpdatedAt: base,
    nextCaseState: {
      ...input.nextCaseState,
      status: input.nextStatus,
    },
    built: buildStatusChangedAudit({
      from: oldStatus,
      to: input.nextStatus,
      actor: trusted,
      operationId: input.operationId,
    }),
  });
}

export type ChecklistCommandAction =
  | "complete"
  | "reopen"
  | "add"
  | "delete";

function checklistActionType(
  action: ChecklistCommandAction,
): AuditActionType {
  switch (action) {
    case "complete":
      return "CHECKLIST_COMPLETED";
    case "reopen":
      return "CHECKLIST_REOPENED";
    case "add":
      return "CHECKLIST_ADDED";
    case "delete":
      return "CHECKLIST_DELETED";
  }
}

/** Checklist 语义命令 */
export async function applyChecklistCommand(input: {
  caseId: string;
  action: ChecklistCommandAction;
  itemId: string;
  operationId: string;
  nextCaseState: NextCaseStateInput;
  baseUpdatedAt: string;
  actor: AuditActor;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  const idempotent = await resolveOperationId({
    caseId: input.caseId,
    operationId: input.operationId,
    actor: trusted,
    actionType: checklistActionType(input.action),
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const oldItems = asPersistedState(existing).checklist;
  const nextItems = input.nextCaseState.checklist;
  const oldItem = oldItems.find((i) => i.id === input.itemId);
  const nextItem = nextItems.find((i) => i.id === input.itemId);

  let built:
    | ReturnType<typeof buildChecklistCompletedAudit>
    | null = null;

  if (input.action === "complete") {
    if (!oldItem) return { ok: false, error: "核查事项不存在" };
    if (oldItem.completed) {
      return { ok: true, alreadyApplied: true, case: existing, audit: null };
    }
    if (!nextItem?.completed) {
      return { ok: false, error: "完成核查的目标状态无效" };
    }
    built = buildChecklistCompletedAudit({
      itemId: oldItem.id,
      label: oldItem.label,
      actor: trusted,
      operationId: input.operationId,
    });
    built = {
      ...built,
      changes: { ...(built.changes ?? {}), origin: oldItem.origin },
    };
  } else if (input.action === "reopen") {
    if (!oldItem) return { ok: false, error: "核查事项不存在" };
    if (!oldItem.completed) {
      return { ok: true, alreadyApplied: true, case: existing, audit: null };
    }
    if (nextItem?.completed) {
      return { ok: false, error: "重新打开核查的目标状态无效" };
    }
    built = buildChecklistReopenedAudit({
      itemId: oldItem.id,
      label: oldItem.label,
      actor: trusted,
      operationId: input.operationId,
    });
    built = {
      ...built,
      changes: { ...(built.changes ?? {}), origin: oldItem.origin },
    };
  } else if (input.action === "add") {
    if (oldItem) {
      return { ok: true, alreadyApplied: true, case: existing, audit: null };
    }
    if (!nextItem || nextItem.origin !== "MANUAL") {
      return { ok: false, error: "仅允许新增人工核查事项" };
    }
    built = buildChecklistAddedAudit({
      itemId: nextItem.id,
      label: nextItem.label,
      actor: trusted,
      operationId: input.operationId,
    });
    built = {
      ...built,
      changes: { ...(built.changes ?? {}), origin: nextItem.origin },
    };
  } else if (input.action === "delete") {
    if (!oldItem) {
      return { ok: true, alreadyApplied: true, case: existing, audit: null };
    }
    if (oldItem.origin === "SYSTEM") {
      return { ok: false, error: "系统生成的核查事项不能删除。" };
    }
    if (nextItem) {
      return { ok: false, error: "删除核查的目标状态仍包含该事项" };
    }
    built = buildChecklistDeletedAudit({
      itemId: oldItem.id,
      label: oldItem.label,
      actor: trusted,
      operationId: input.operationId,
    });
    built = {
      ...built,
      changes: { ...(built.changes ?? {}), origin: oldItem.origin },
    };
  } else {
    return { ok: false, error: "未知核查操作" };
  }

  return commitStateAndAudit({
    caseId: input.caseId,
    baseUpdatedAt: base,
    nextCaseState: input.nextCaseState,
    built: built!,
  });
}

function collectStructuredBcDiff(
  from: BusinessContext,
  to: BusinessContext,
): Record<string, { from: string; to: string }> {
  const changes: Record<string, { from: string; to: string }> = {};
  for (const field of STRUCTURED_BC_FIELDS) {
    if (from[field] !== to[field]) {
      changes[field] = { from: from[field], to: to[field] };
    }
  }
  return changes;
}

/** 结构化 BusinessContext 变更 */
export async function updateBusinessContextCommand(input: {
  caseId: string;
  operationId: string;
  nextCaseState: NextCaseStateInput;
  baseUpdatedAt: string;
  actor: AuditActor;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  const idempotent = await resolveOperationId({
    caseId: input.caseId,
    operationId: input.operationId,
    actor: trusted,
    actionType: "BUSINESS_CONTEXT_UPDATED",
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const oldBc = asPersistedState(existing).businessContext;
  const nextBc = input.nextCaseState.businessContext;
  const enumChanges = collectStructuredBcDiff(oldBc, nextBc);

  if (Object.keys(enumChanges).length === 0) {
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  const built = buildBusinessContextUpdatedAudit({
    fields: Object.keys(enumChanges),
    enumChanges: Object.fromEntries(
      Object.entries(enumChanges).map(([k, v]) => [
        k,
        { from: v.from, to: v.to },
      ]),
    ),
    actor: trusted,
    operationId: input.operationId,
  });

  const fieldChanges: Record<string, { from: string; to: string }> = {
    ...enumChanges,
  };

  return commitStateAndAudit({
    caseId: input.caseId,
    baseUpdatedAt: base,
    nextCaseState: input.nextCaseState,
    built: {
      ...built,
      changes: fieldChanges,
    },
  });
}

/** HumanReview 结构化结论变更 */
export async function updateHumanReviewCommand(input: {
  caseId: string;
  operationId: string;
  nextCaseState: NextCaseStateInput;
  baseUpdatedAt: string;
  actor: AuditActor;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  const idempotent = await resolveOperationId({
    caseId: input.caseId,
    operationId: input.operationId,
    actor: trusted,
    actionType: "HUMAN_REVIEW_UPDATED",
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const oldHr = asPersistedState(existing).humanReview;
  const nextHr = input.nextCaseState.humanReview;
  const oldConclusion = oldHr?.finalConclusion ?? null;
  const nextConclusion = nextHr?.finalConclusion ?? null;
  const oldRisk = oldHr?.humanRiskLevel ?? null;
  const nextRisk = nextHr?.humanRiskLevel ?? null;

  const conclusionChanged = oldConclusion !== nextConclusion;
  const riskChanged = oldRisk !== nextRisk;

  if (!conclusionChanged && !riskChanged) {
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  const built = buildHumanReviewUpdatedAudit({
    finalConclusion: conclusionChanged
      ? {
          from: oldConclusion as FinalConclusion | null,
          to: nextConclusion as FinalConclusion | null,
        }
      : undefined,
    humanRiskLevel: riskChanged
      ? {
          from: oldRisk as RiskLevel | null,
          to: nextRisk as RiskLevel | null,
        }
      : undefined,
    actor: trusted,
    operationId: input.operationId,
  });

  const changes: Record<string, unknown> = {};
  if (conclusionChanged) {
    changes.finalConclusion = { from: oldConclusion, to: nextConclusion };
  }
  if (riskChanged) {
    changes.humanRiskLevel = { from: oldRisk, to: nextRisk };
  }

  return commitStateAndAudit({
    caseId: input.caseId,
    baseUpdatedAt: base,
    nextCaseState: input.nextCaseState,
    built: {
      ...built,
      changes,
    },
  });
}

/** 人工新增 Timeline */
export async function addTimelineEventCommand(input: {
  caseId: string;
  operationId: string;
  eventId: string;
  nextCaseState: NextCaseStateInput;
  baseUpdatedAt: string;
  actor: AuditActor;
}): Promise<CommandResult> {
  const actor = requireActor(input.actor);
  if ("ok" in actor && actor.ok === false) return actor;
  const trusted = actor as TrustedCommandActor;

  const idempotent = await resolveOperationId({
    caseId: input.caseId,
    operationId: input.operationId,
    actor: trusted,
    actionType: "TIMELINE_EVENT_ADDED",
  });
  if (idempotent) return idempotent;

  const base = requireBaseUpdatedAt(input.baseUpdatedAt);
  if (typeof base !== "string") return base;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const oldTimeline = asPersistedState(existing).timeline;
  if (oldTimeline.some((e) => e.id === input.eventId)) {
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  const nextEvent = input.nextCaseState.timeline.find(
    (e) => e.id === input.eventId,
  );
  if (!nextEvent) {
    return { ok: false, error: "目标时间线事件缺失" };
  }
  if (nextEvent.source !== "HUMAN") {
    return { ok: false, error: "仅审计人工新增时间线事件" };
  }

  const built = buildTimelineEventAddedAudit({
    eventId: nextEvent.id,
    title: nextEvent.title,
    actor: trusted,
    operationId: input.operationId,
  });

  return commitStateAndAudit({
    caseId: input.caseId,
    baseUpdatedAt: base,
    nextCaseState: input.nextCaseState,
    built: {
      ...built,
      changes: {
        eventId: nextEvent.id,
        eventType: nextEvent.eventType,
        title: nextEvent.title,
      },
    },
  });
}
