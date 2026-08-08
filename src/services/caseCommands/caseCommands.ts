/**
 * 案件 Semantic Commands：业务状态更新 + Audit 同事务。
 * 与普通 saveCaseState autosave 路径分离。
 */

import type {
  BusinessContext,
  CaseStatus,
  FinalConclusion,
  HumanReview,
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
} from "@/services/audit/auditEventBuilder";
import {
  appendCaseAudit,
  findAuditByOperationId,
  runInTransaction,
} from "@/services/persistence/auditRepository";
import {
  createCaseRecord,
  getCaseById,
  saveCaseState,
} from "@/services/persistence/caseRepository";
import type {
  CreateCaseInput,
  PersistedCase,
  PersistedCaseState,
} from "@/services/persistence/types";
import type { CommandResult, NextCaseStateInput } from "./types";
import { isCaseStatus } from "./types";

const STRUCTURED_BC_FIELDS = [
  "plannedTaskStatus",
  "changeTicketStatus",
  "ownerVerification",
  "businessLegitimacy",
] as const;

async function resolveOperationId(
  caseId: string,
  operationId: string | null | undefined,
): Promise<CommandResult | null> {
  if (!operationId?.trim()) return null;
  const existing = await findAuditByOperationId(operationId.trim());
  if (!existing) return null;
  if (existing.caseId !== caseId) {
    return { ok: false, error: "operationId 已被其他案件使用" };
  }
  const record = await getCaseById(caseId);
  if (!record) return { ok: false, error: "案件不存在" };
  return {
    ok: true,
    alreadyApplied: true,
    case: record,
    audit: existing,
  };
}

function reviewerOf(state: {
  humanReview: HumanReview | null | undefined;
}): string | null {
  return state.humanReview?.reviewer ?? null;
}

function asPersistedState(record: PersistedCase): PersistedCaseState {
  return record.caseState;
}

/** 创建案件 + CASE_CREATED（同事务；operationId 幂等） */
export async function createCaseWithAudit(
  input: CreateCaseInput,
  options?: { sourceType?: string | null; operationId?: string | null },
): Promise<CommandResult> {
  const operationId = options?.operationId?.trim() || null;
  if (operationId) {
    const existing = await findAuditByOperationId(operationId);
    if (existing) {
      if (existing.actionType !== "CASE_CREATED") {
        return { ok: false, error: "operationId 已被其他操作使用" };
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
            sourceType: options?.sourceType,
            operationId,
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
    // 并发同 operationId：唯一约束冲突时回读已创建结果
    if (operationId) {
      const raced = await findAuditByOperationId(operationId);
      if (raced?.actionType === "CASE_CREATED") {
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
}): Promise<CommandResult> {
  if (!isCaseStatus(input.nextStatus)) {
    return { ok: false, error: "案件状态无效" };
  }
  const idempotent = await resolveOperationId(input.caseId, input.operationId);
  if (idempotent) return idempotent;

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

  try {
    const result = await runInTransaction(async (tx) => {
      await saveCaseState(
        input.caseId,
        {
          ...input.nextCaseState,
          status: input.nextStatus,
        },
        tx,
      );
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...buildStatusChangedAudit({
            from: oldStatus,
            to: input.nextStatus,
            reviewer: reviewerOf(input.nextCaseState),
            operationId: input.operationId,
          }),
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
      audit: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "状态修改失败";
    return { ok: false, error: message };
  }
}

export type ChecklistCommandAction =
  | "complete"
  | "reopen"
  | "add"
  | "delete";

/** Checklist 语义命令 */
export async function applyChecklistCommand(input: {
  caseId: string;
  action: ChecklistCommandAction;
  itemId: string;
  operationId: string;
  nextCaseState: NextCaseStateInput;
}): Promise<CommandResult> {
  const idempotent = await resolveOperationId(input.caseId, input.operationId);
  if (idempotent) return idempotent;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  const oldItems = asPersistedState(existing).checklist;
  const nextItems = input.nextCaseState.checklist;
  const oldItem = oldItems.find((i) => i.id === input.itemId);
  const nextItem = nextItems.find((i) => i.id === input.itemId);
  const reviewer = reviewerOf(input.nextCaseState);

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
      reviewer,
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
      reviewer,
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
      reviewer,
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
    if (nextItem) {
      return { ok: false, error: "删除核查的目标状态仍包含该事项" };
    }
    built = buildChecklistDeletedAudit({
      itemId: oldItem.id,
      label: oldItem.label,
      reviewer,
      operationId: input.operationId,
    });
    built = {
      ...built,
      changes: { ...(built.changes ?? {}), origin: oldItem.origin },
    };
  } else {
    return { ok: false, error: "未知核查操作" };
  }

  try {
    const audit = await runInTransaction(async (tx) => {
      await saveCaseState(input.caseId, input.nextCaseState, tx);
      return appendCaseAudit({ caseId: input.caseId, ...built! }, tx);
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
    const message = error instanceof Error ? error.message : "核查项更新失败";
    return { ok: false, error: message };
  }
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
}): Promise<CommandResult> {
  const idempotent = await resolveOperationId(input.caseId, input.operationId);
  if (idempotent) return idempotent;

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
    reviewer: reviewerOf(input.nextCaseState),
    operationId: input.operationId,
  });

  // changes 使用字段级 from/to（产品约定）
  const fieldChanges: Record<string, { from: string; to: string }> = {
    ...enumChanges,
  };

  try {
    const audit = await runInTransaction(async (tx) => {
      await saveCaseState(input.caseId, input.nextCaseState, tx);
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...built,
          changes: fieldChanges,
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
    const message =
      error instanceof Error ? error.message : "业务核查信息更新失败";
    return { ok: false, error: message };
  }
}

/** HumanReview 结构化结论变更 */
export async function updateHumanReviewCommand(input: {
  caseId: string;
  operationId: string;
  nextCaseState: NextCaseStateInput;
}): Promise<CommandResult> {
  const idempotent = await resolveOperationId(input.caseId, input.operationId);
  if (idempotent) return idempotent;

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
    reviewer: reviewerOf(input.nextCaseState),
    operationId: input.operationId,
  });

  const changes: Record<string, unknown> = {};
  if (conclusionChanged) {
    changes.finalConclusion = { from: oldConclusion, to: nextConclusion };
  }
  if (riskChanged) {
    changes.humanRiskLevel = { from: oldRisk, to: nextRisk };
  }

  try {
    const audit = await runInTransaction(async (tx) => {
      await saveCaseState(input.caseId, input.nextCaseState, tx);
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...built,
          changes,
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
    const message =
      error instanceof Error ? error.message : "人工研判更新失败";
    return { ok: false, error: message };
  }
}

/** 人工新增 Timeline */
export async function addTimelineEventCommand(input: {
  caseId: string;
  operationId: string;
  eventId: string;
  nextCaseState: NextCaseStateInput;
}): Promise<CommandResult> {
  const idempotent = await resolveOperationId(input.caseId, input.operationId);
  if (idempotent) return idempotent;

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
    reviewer: reviewerOf(input.nextCaseState),
    operationId: input.operationId,
  });

  try {
    const audit = await runInTransaction(async (tx) => {
      await saveCaseState(input.caseId, input.nextCaseState, tx);
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...built,
          changes: {
            eventId: nextEvent.id,
            eventType: nextEvent.eventType,
            title: nextEvent.title,
          },
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
    const message =
      error instanceof Error ? error.message : "时间线事件添加失败";
    return { ok: false, error: message };
  }
}