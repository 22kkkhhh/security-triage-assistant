"use server";

import type { CaseStatus } from "@/domain/types";
import {
  addHandoffNoteCommand,
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
  type ChecklistCommandAction,
} from "@/services/caseCommands";
import {
  listCaseAuditLogs,
  type CaseAuditLogView,
  type ListCaseAuditLogsResult,
} from "@/services/persistence/auditRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";
import { isCaseStatus } from "@/services/caseCommands";

export type SemanticCommandActionResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      /** 服务端真实 CaseRecord.updatedAt（用作 baseUpdatedAt） */
      updatedAt: string;
      lastActivityAt: string;
      status: CaseStatus;
    }
  | { ok: false; error: string };

const CHECKLIST_ACTIONS: ChecklistCommandAction[] = [
  "complete",
  "reopen",
  "add",
  "delete",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNextState(raw: unknown): SaveCaseStateInput | string {
  if (!isObject(raw)) return "案件状态数据无效";
  if (!isObject(raw.caseData)) return "caseData 无效";
  if (!isObject(raw.businessContext)) return "businessContext 无效";
  if (!Array.isArray(raw.checklist)) return "checklist 无效";
  if (!Array.isArray(raw.timeline)) return "timeline 无效";
  if (raw.humanReview !== null && !isObject(raw.humanReview)) {
    return "humanReview 无效";
  }
  return {
    caseData: raw.caseData as unknown as SaveCaseStateInput["caseData"],
    businessContext:
      raw.businessContext as unknown as SaveCaseStateInput["businessContext"],
    checklist: raw.checklist as unknown as SaveCaseStateInput["checklist"],
    humanReview: raw.humanReview as unknown as SaveCaseStateInput["humanReview"],
    timeline: raw.timeline as unknown as SaveCaseStateInput["timeline"],
    suggestedRiskLevel:
      (raw.suggestedRiskLevel as SaveCaseStateInput["suggestedRiskLevel"]) ??
      null,
    status: raw.status as CaseStatus | undefined,
  };
}

function toResult(
  result: Awaited<ReturnType<typeof changeCaseStatusCommand>>,
): SemanticCommandActionResult {
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    updatedAt: result.case.updatedAt,
    lastActivityAt: result.case.lastActivityAt,
    status: result.case.status,
  };
}

export async function changeCaseStatusAction(
  caseId: string,
  nextStatus: unknown,
  operationId: unknown,
  rawNextState: unknown,
): Promise<SemanticCommandActionResult> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (!isCaseStatus(nextStatus)) return { ok: false, error: "案件状态无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const nextCaseState = parseNextState(rawNextState);
  if (typeof nextCaseState === "string") {
    return { ok: false, error: nextCaseState };
  }
  return toResult(
    await changeCaseStatusCommand({
      caseId,
      nextStatus,
      operationId: operationId.trim(),
      nextCaseState,
    }),
  );
}

export async function applyChecklistCommandAction(
  caseId: string,
  action: unknown,
  itemId: unknown,
  operationId: unknown,
  rawNextState: unknown,
): Promise<SemanticCommandActionResult> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (
    typeof action !== "string" ||
    !CHECKLIST_ACTIONS.includes(action as ChecklistCommandAction)
  ) {
    return { ok: false, error: "核查操作无效" };
  }
  if (typeof itemId !== "string" || !itemId.trim()) {
    return { ok: false, error: "核查事项 ID 无效" };
  }
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const nextCaseState = parseNextState(rawNextState);
  if (typeof nextCaseState === "string") {
    return { ok: false, error: nextCaseState };
  }
  return toResult(
    await applyChecklistCommand({
      caseId,
      action: action as ChecklistCommandAction,
      itemId: itemId.trim(),
      operationId: operationId.trim(),
      nextCaseState,
    }),
  );
}

export async function updateBusinessContextAction(
  caseId: string,
  operationId: unknown,
  rawNextState: unknown,
): Promise<SemanticCommandActionResult> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const nextCaseState = parseNextState(rawNextState);
  if (typeof nextCaseState === "string") {
    return { ok: false, error: nextCaseState };
  }
  return toResult(
    await updateBusinessContextCommand({
      caseId,
      operationId: operationId.trim(),
      nextCaseState,
    }),
  );
}

export async function updateHumanReviewAction(
  caseId: string,
  operationId: unknown,
  rawNextState: unknown,
): Promise<SemanticCommandActionResult> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const nextCaseState = parseNextState(rawNextState);
  if (typeof nextCaseState === "string") {
    return { ok: false, error: nextCaseState };
  }
  return toResult(
    await updateHumanReviewCommand({
      caseId,
      operationId: operationId.trim(),
      nextCaseState,
    }),
  );
}

export async function addTimelineEventAction(
  caseId: string,
  eventId: unknown,
  operationId: unknown,
  rawNextState: unknown,
): Promise<SemanticCommandActionResult> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof eventId !== "string" || !eventId.trim()) {
    return { ok: false, error: "时间线事件 ID 无效" };
  }
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const nextCaseState = parseNextState(rawNextState);
  if (typeof nextCaseState === "string") {
    return { ok: false, error: nextCaseState };
  }
  return toResult(
    await addTimelineEventCommand({
      caseId,
      eventId: eventId.trim(),
      operationId: operationId.trim(),
      nextCaseState,
    }),
  );
}

export type HandoffActionResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      lastActivityAt: string;
      audit: CaseAuditLogView;
    }
  | { ok: false; error: string };

/** 添加交接说明（append-only Audit） */
export async function addHandoffNoteAction(
  caseId: string,
  note: unknown,
  operationId: unknown,
): Promise<HandoffActionResult> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof note !== "string") return { ok: false, error: "交接说明无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const result = await addHandoffNoteCommand({
    caseId,
    note,
    operationId: operationId.trim(),
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.audit) {
    return { ok: false, error: "交接记录添加失败，请重试。" };
  }
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    lastActivityAt: result.case.lastActivityAt,
    audit: result.audit,
  };
}

/** Activity Feed 分页加载（不更新 lastActivityAt） */
export async function loadMoreCaseAuditLogsAction(
  caseId: string,
  cursor: unknown,
  limit: unknown = 40,
): Promise<
  | { ok: true; result: ListCaseAuditLogsResult }
  | { ok: false; error: string }
> {
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (cursor != null && (typeof cursor !== "string" || !cursor.trim())) {
    return { ok: false, error: "分页游标无效" };
  }
  const take =
    typeof limit === "number" && Number.isFinite(limit) ? limit : 40;
  try {
    const result = await listCaseAuditLogs({
      caseId,
      cursor: typeof cursor === "string" ? cursor : null,
      limit: take,
    });
    return { ok: true, result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "操作记录加载失败，请重试。";
    return { ok: false, error: message };
  }
}
