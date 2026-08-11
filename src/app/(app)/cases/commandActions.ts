"use server";

import type {
  BusinessLegitimacy,
  CaseStatus,
  ChecklistSourceRef,
  ExistenceStatus,
  SecurityDomain,
  VerificationStatus,
} from "@/domain/types";
import {
  businessLegitimacyLabels,
  existenceStatusLabels,
  securityDomainLabels,
  verificationStatusLabels,
} from "@/domain/labels";
import {
  addHandoffNoteCommand,
  addTimelineEventCommand,
  applyChecklistCommand,
  assignCaseCommand,
  changeCaseStatusCommand,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
  type BusinessContextSemanticPatch,
  type ChecklistAddSemanticIntent,
  type ChecklistCommandAction,
  type TimelineEventSemanticIntent,
} from "@/services/caseCommands";
import type { CaseOwnership } from "@/domain/caseOwnership";
import { listEligibleAssignees } from "@/services/caseOwnership/eligibleAssignees";
import type { CaseAssigneeSummary } from "@/domain/caseOwnership";
import { parseHumanReviewSemanticInput } from "@/services/caseCommands/humanReviewSemantic";
import { userActor } from "@/services/audit/auditEventBuilder";
import {
  requirePermission,
  toAuthActionFailure,
} from "@/services/auth/requirePermission";
import { analyzePersistedCase } from "@/services/analysis/analyzePersistedCase";
import { buildInvestigationIntelligence } from "@/services/correlation/buildInvestigationIntelligence";
import { toCurrentAnalysisHints } from "@/services/correlation/currentAnalysisHints";
import { loadRelatedCasesForCase } from "@/services/correlation/loadRelatedCases";
import { createChecklistItemFromInvestigationLead } from "@/services/checklist/fromInvestigationLead";
import { isInvestigationLeadCode } from "@/services/checklist/investigationLeadCanonical";
import { getCaseById } from "@/services/persistence/caseRepository";
import {
  listCaseAuditLogs,
  type CaseAuditLogView,
  type ListCaseAuditLogsResult,
} from "@/services/persistence/auditRepository";
import type { PersistedCaseState } from "@/services/persistence/types";
import { isCaseStatus } from "@/services/caseCommands";
import {
  sanitizeActionErrorMessage,
  unknownActionErrorMessage,
} from "@/app/(app)/actionErrorSanitizer";

const COMMAND_FALLBACK = "操作暂未完成，请稍后重试。";
const STALE_FALLBACK = "案件已发生更新，已刷新到最新状态。";
const HANDOFF_FALLBACK = "交接记录添加暂未完成，请稍后重试。";
const ACTIVITY_FALLBACK = "操作记录加载暂未完成，请稍后重试。";

export type SemanticCommandActionResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      /** 服务端真实 CaseRecord.updatedAt（用作 baseUpdatedAt） */
      updatedAt: string;
      lastActivityAt: string;
      status: CaseStatus;
      /** 成功后的 canonical caseState（含 Server-owned HumanReview 责任人） */
      caseState: PersistedCaseState;
      /** 运营负责人（与 HumanReview reviewer 分离） */
      ownership: CaseOwnership;
      /** 本次新产生或幂等命中的 Audit；无实际变化时为 null */
      audit: CaseAuditLogView | null;
    }
  | {
      ok: false;
      error: string;
      code?: "STALE" | "UNAUTHENTICATED" | "FORBIDDEN";
      updatedAt?: string;
      lastActivityAt?: string;
      status?: CaseStatus;
      caseState?: PersistedCaseState;
      ownership?: CaseOwnership;
    };

const CHECKLIST_ACTIONS: ChecklistCommandAction[] = [
  "complete",
  "reopen",
  "add",
  "delete",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBaseUpdatedAt(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

function isExistenceStatus(value: unknown): value is ExistenceStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(existenceStatusLabels, value)
  );
}

function isVerificationStatus(value: unknown): value is VerificationStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(verificationStatusLabels, value)
  );
}

function isBusinessLegitimacy(value: unknown): value is BusinessLegitimacy {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(businessLegitimacyLabels, value)
  );
}

function isSecurityDomain(value: unknown): value is SecurityDomain {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(securityDomainLabels, value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * BusinessContext 语义命令输入：只接受四个结构化字段。
 * changeTicketId / businessOwner / businessJustification 属 Snapshot Autosave，
 * 以及 checklist / humanReview / timeline / status / suggestedRiskLevel
 * 均不转发给 Command。
 */
function parseBusinessContextPatch(
  raw: unknown,
): BusinessContextSemanticPatch | string {
  if (!isObject(raw)) return "业务核查信息无效";
  if (!isExistenceStatus(raw.plannedTaskStatus)) return "计划任务状态无效";
  if (!isExistenceStatus(raw.changeTicketStatus)) return "变更工单状态无效";
  if (!isVerificationStatus(raw.ownerVerification)) return "负责人确认状态无效";
  if (!isBusinessLegitimacy(raw.businessLegitimacy)) return "业务合理性结论无效";
  return {
    plannedTaskStatus: raw.plannedTaskStatus,
    changeTicketStatus: raw.changeTicketStatus,
    ownerVerification: raw.ownerVerification,
    businessLegitimacy: raw.businessLegitimacy,
  };
}

function parseChecklistSourceRef(raw: unknown): ChecklistSourceRef | null {
  if (!isObject(raw)) return null;
  if (!isNonEmptyString(raw.suggestionKey)) return null;
  if (
    raw.kind !== "CONTEXT" &&
    raw.kind !== "EVIDENCE" &&
    raw.kind !== "CHECKLIST"
  ) {
    return null;
  }
  if (
    !Array.isArray(raw.controlCodes) ||
    !raw.controlCodes.every((code) => typeof code === "string")
  ) {
    return null;
  }
  if (!Array.isArray(raw.clauseRefs)) return null;
  const clauseRefs: NonNullable<ChecklistSourceRef["clauseRefs"]> = [];
  for (const ref of raw.clauseRefs) {
    if (!isObject(ref)) return null;
    if (
      typeof ref.clauseKey !== "string" ||
      typeof ref.documentCanonicalCode !== "string"
    ) {
      return null;
    }
    clauseRefs.push({
      clauseKey: ref.clauseKey,
      documentCanonicalCode: ref.documentCanonicalCode,
    });
  }
  if (typeof raw.relevance !== "string") return null;
  return {
    suggestionKey: raw.suggestionKey,
    kind: raw.kind,
    controlCodes: [...raw.controlCodes],
    clauseRefs,
    relevance: raw.relevance,
  };
}

/**
 * Checklist add 语义输入：只构造 allowlisted minimal intent。
 * completed / origin / relatedRuleId 由 Server 决定，不接受浏览器输入。
 */
function parseChecklistAddIntent(
  raw: unknown,
  itemId: string,
): ChecklistAddSemanticIntent | string {
  if (!isObject(raw)) return "核查事项内容无效";
  if (raw.id !== itemId) return "核查事项 ID 不一致";
  if (!isSecurityDomain(raw.category)) return "核查事项分类无效";
  if (!isNonEmptyString(raw.label)) return "核查事项名称无效";
  if (raw.note != null && typeof raw.note !== "string") {
    return "核查事项备注无效";
  }
  const intent: ChecklistAddSemanticIntent = {
    id: itemId,
    category: raw.category,
    label: raw.label,
    note: typeof raw.note === "string" ? raw.note : null,
  };
  if (raw.sourceKind === undefined || raw.sourceKind === null) {
    return intent;
  }
  if (raw.sourceKind !== "KNOWLEDGE_SUGGESTED") {
    return "核查事项来源无效";
  }
  const sourceRef = parseChecklistSourceRef(raw.sourceRef);
  if (!sourceRef) return "核查事项来源引用无效";
  return { ...intent, sourceKind: "KNOWLEDGE_SUGGESTED", sourceRef };
}

/**
 * Timeline 语义输入：只构造 allowlisted minimal intent。
 * source 由 Server 强制为 HUMAN，不接受浏览器输入。
 */
function parseTimelineEventIntent(
  raw: unknown,
  eventId: string,
): TimelineEventSemanticIntent | string {
  if (!isObject(raw)) return "时间线事件内容无效";
  if (raw.id !== eventId) return "时间线事件 ID 不一致";
  if (!isNonEmptyString(raw.occurredAt)) return "事件发生时间无效";
  if (!isNonEmptyString(raw.eventType)) return "事件类型无效";
  if (!isNonEmptyString(raw.title)) return "事件标题无效";
  if (typeof raw.description !== "string") return "事件说明无效";
  if (raw.operator != null && typeof raw.operator !== "string") {
    return "事件操作人无效";
  }
  return {
    id: eventId,
    occurredAt: raw.occurredAt,
    eventType: raw.eventType,
    title: raw.title,
    description: raw.description,
    operator: typeof raw.operator === "string" ? raw.operator : null,
  };
}

function toResult(
  result: Awaited<ReturnType<typeof changeCaseStatusCommand>>,
): SemanticCommandActionResult {
  if (!result.ok) {
    if (result.code === "STALE" && result.case) {
      return {
        ok: false,
        error: sanitizeActionErrorMessage(result.error, STALE_FALLBACK),
        code: "STALE",
        updatedAt: result.case.updatedAt,
        lastActivityAt: result.case.lastActivityAt,
        status: result.case.status,
        caseState: result.case.caseState,
        ownership: result.case.ownership,
      };
    }
    if (result.code === "FORBIDDEN") {
      return {
        ok: false,
        error: sanitizeActionErrorMessage(
          result.error,
          "当前账号无权限执行此操作",
        ),
        code: "FORBIDDEN",
      };
    }
    return {
      ok: false,
      error: sanitizeActionErrorMessage(result.error, COMMAND_FALLBACK),
    };
  }
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    updatedAt: result.case.updatedAt,
    lastActivityAt: result.case.lastActivityAt,
    status: result.case.status,
    caseState: result.case.caseState,
    ownership: result.case.ownership,
    audit: result.audit,
  };
}

/** 案件负责人分配 / 释放 */
export async function assignCaseAction(
  caseId: string,
  targetUserId: unknown,
  operationId: unknown,
  baseUpdatedAt: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("CASE_ASSIGN");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };

  let parsedTarget: string | null;
  if (targetUserId === null || targetUserId === undefined || targetUserId === "") {
    parsedTarget = null;
  } else if (typeof targetUserId === "string" && targetUserId.trim()) {
    parsedTarget = targetUserId.trim();
  } else {
    return { ok: false, error: "指派目标无效" };
  }

  return toResult(
    await assignCaseCommand({
      caseId,
      targetUserId: parsedTarget,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
      actorRole: user.role,
    }),
  );
}

/** 可指派负责人列表（最小 DTO；Server 查询） */
export async function listEligibleAssigneesAction(): Promise<
  | { ok: true; items: CaseAssigneeSummary[] }
  | { ok: false; error: string; code?: "UNAUTHENTICATED" | "FORBIDDEN" }
> {
  try {
    await requirePermission("CASE_ASSIGN");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  try {
    const items = await listEligibleAssignees();
    return { ok: true, items };
  } catch {
    return { ok: false, error: COMMAND_FALLBACK };
  }
}

/** 状态变更：只发送 nextStatus，不构造任何 case state */
export async function changeCaseStatusAction(
  caseId: string,
  nextStatus: unknown,
  operationId: unknown,
  baseUpdatedAt: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("CASE_STATUS_CHANGE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (!isCaseStatus(nextStatus)) return { ok: false, error: "案件状态无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };
  return toResult(
    await changeCaseStatusCommand({
      caseId,
      nextStatus,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
    }),
  );
}

/**
 * 核查事项命令：complete / reopen / delete 不需要任何 item state；
 * add 只接受 allowlisted minimal intent。
 */
export async function applyChecklistCommandAction(
  caseId: string,
  action: unknown,
  itemId: unknown,
  operationId: unknown,
  baseUpdatedAt: unknown,
  rawItemIntent?: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("CHECKLIST_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
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
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };

  const checklistAction = action as ChecklistCommandAction;
  const trimmedItemId = itemId.trim();
  if (checklistAction !== "add") {
    return toResult(
      await applyChecklistCommand({
        caseId,
        action: checklistAction,
        itemId: trimmedItemId,
        operationId: operationId.trim(),
        baseUpdatedAt: base,
        actor: userActor(user),
      }),
    );
  }

  const itemIntent = parseChecklistAddIntent(rawItemIntent, trimmedItemId);
  if (typeof itemIntent === "string") {
    return { ok: false, error: itemIntent };
  }
  return toResult(
    await applyChecklistCommand({
      caseId,
      action: checklistAction,
      itemId: trimmedItemId,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
      itemIntent,
    }),
  );
}

/**
 * BusinessContext 语义命令：只接受四个结构化字段。
 * 自由文本字段仍走 Snapshot Autosave，不经此路径。
 */
export async function updateBusinessContextAction(
  caseId: string,
  operationId: unknown,
  baseUpdatedAt: unknown,
  rawPatch: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("BUSINESS_CONTEXT_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };
  const businessContextPatch = parseBusinessContextPatch(rawPatch);
  if (typeof businessContextPatch === "string") {
    return { ok: false, error: businessContextPatch };
  }
  return toResult(
    await updateBusinessContextCommand({
      caseId,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
      businessContextPatch,
    }),
  );
}

/**
 * HumanReview Semantic Action：仅接受 finalConclusion / humanRiskLevel。
 * reviewer / reviewedByUserId / conclusionNote 等一律 runtime reject。
 */
export async function updateHumanReviewAction(
  caseId: string,
  operationId: unknown,
  rawSemantic: unknown,
  baseUpdatedAt: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("HUMAN_REVIEW_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };
  const semantic = parseHumanReviewSemanticInput(rawSemantic);
  if (typeof semantic === "string") {
    return { ok: false, error: semantic };
  }
  return toResult(
    await updateHumanReviewCommand({
      caseId,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
      finalConclusion: semantic.finalConclusion,
      humanRiskLevel: semantic.humanRiskLevel,
    }),
  );
}

/** 时间线追加：只接受 allowlisted minimal intent；source 由 Server 强制 HUMAN */
export async function addTimelineEventAction(
  caseId: string,
  eventId: unknown,
  operationId: unknown,
  baseUpdatedAt: unknown,
  rawEventIntent: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("TIMELINE_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof eventId !== "string" || !eventId.trim()) {
    return { ok: false, error: "时间线事件 ID 无效" };
  }
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };
  const trimmedEventId = eventId.trim();
  const eventIntent = parseTimelineEventIntent(rawEventIntent, trimmedEventId);
  if (typeof eventIntent === "string") {
    return { ok: false, error: eventIntent };
  }
  return toResult(
    await addTimelineEventCommand({
      caseId,
      eventId: trimmedEventId,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
      eventIntent,
    }),
  );
}

export type HandoffActionResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      updatedAt: string;
      lastActivityAt: string;
      audit: CaseAuditLogView;
    }
  | {
      ok: false;
      error: string;
      code?: "UNAUTHENTICATED" | "FORBIDDEN";
    };

/** 添加交接说明（append-only Audit） */
export async function addHandoffNoteAction(
  caseId: string,
  note: unknown,
  operationId: unknown,
): Promise<HandoffActionResult> {
  let user;
  try {
    user = await requirePermission("HANDOFF_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof note !== "string") return { ok: false, error: "交接说明无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const result = await addHandoffNoteCommand({
    caseId,
    note,
    operationId: operationId.trim(),
    actor: userActor(user),
  });
  if (!result.ok) {
    return {
      ok: false,
      error: sanitizeActionErrorMessage(result.error, HANDOFF_FALLBACK),
      code: result.code === "FORBIDDEN" ? "FORBIDDEN" : undefined,
    };
  }
  if (!result.audit) {
    return { ok: false, error: HANDOFF_FALLBACK };
  }
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    updatedAt: result.case.updatedAt,
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
  | {
      ok: false;
      error: string;
      code?: "UNAUTHENTICATED" | "FORBIDDEN";
    }
> {
  try {
    await requirePermission("ACTIVITY_READ");
  } catch (error) {
    return toAuthActionFailure(error);
  }
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
  } catch {
    return { ok: false, error: unknownActionErrorMessage(ACTIVITY_FALLBACK) };
  }
}

/**
 * Investigation Lead → Checklist opt-in。
 * Server 重新计算 intelligence 并校验 leadCode；不信任 Client provenance。
 */
export async function addInvestigationLeadToChecklistAction(
  caseId: string,
  leadCode: unknown,
  operationId: unknown,
  baseUpdatedAt: unknown,
): Promise<SemanticCommandActionResult> {
  let user;
  try {
    user = await requirePermission("CHECKLIST_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof leadCode !== "string" || !isInvestigationLeadCode(leadCode)) {
    return { ok: false, error: "调查建议代码无效" };
  }
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const base = parseBaseUpdatedAt(baseUpdatedAt);
  if (!base) return { ok: false, error: "baseUpdatedAt 无效" };

  const record = await getCaseById(caseId.trim());
  if (!record) return { ok: false, error: "案件不存在" };

  const relatedCases = await loadRelatedCasesForCase(record);
  const { analyzed } = analyzePersistedCase(record);
  const intelligence = buildInvestigationIntelligence({
    relatedCases,
    currentAnalysis: toCurrentAnalysisHints(analyzed.analysisResults),
  });

  if (!intelligence.leads.some((lead) => lead.code === leadCode)) {
    return { ok: false, error: "当前案件不存在该调查建议" };
  }

  const item = createChecklistItemFromInvestigationLead({
    leadCode,
    relatedCaseIds: intelligence.relatedCases.map((c) => c.caseId),
    signals: intelligence.signals,
  });

  return toResult(
    await applyChecklistCommand({
      caseId: caseId.trim(),
      action: "add",
      itemId: item.id,
      operationId: operationId.trim(),
      baseUpdatedAt: base,
      actor: userActor(user),
      itemIntent: {
        id: item.id,
        category: item.category,
        label: item.label,
        note: null,
        sourceKind: "INVESTIGATION_LEAD",
        sourceRef: item.sourceRef,
      },
    }),
  );
}
