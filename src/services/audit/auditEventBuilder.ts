/**
 * Audit Event Builder：统一 actionType / summary / changes / metadata / actor。
 * Repository 只负责 append / query；组件不得自行拼审计文案。
 *
 * Trusted Actor（v1.3 Step 5）：
 * - 认证写路径必须传入 userActor(AuthUser) 或 systemActor()
 * - manualActor 仅用于 Seed / Legacy fixture
 */

import {
  AUDIT_SUMMARY_MAX_LENGTH,
  HANDOFF_NOTE_MAX_LENGTH,
  type AuditActionType,
  type AuditActorType,
} from "@/domain/audit";
import type { AuthUser } from "@/domain/auth";
import {
  businessLegitimacyLabels,
  caseStatusLabels,
  finalConclusionLabels,
  riskLevelLabels,
  verificationStatusLabels,
} from "@/domain/labels";
import type {
  BusinessLegitimacy,
  CaseStatus,
  FinalConclusion,
  RiskLevel,
  VerificationStatus,
} from "@/domain/types";

/** Builder 产出的待写入审计事件（尚未绑定 caseId / createdAt） */
export interface BuiltAuditEvent {
  actionType: AuditActionType;
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string;
  summary: string;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  operationId?: string | null;
}

export interface AuditActor {
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string;
}

/** 系统主体（Seed / 未来 Connector） */
export function systemActor(): AuditActor {
  return {
    actorType: "SYSTEM",
    actorId: null,
    actorName: "系统",
  };
}

/**
 * Legacy 人工主体：Seed / 历史 fixture。
 * 认证写路径禁止使用。
 */
export function manualActor(reviewer?: string | null): AuditActor {
  const name = reviewer?.trim();
  return {
    actorType: "MANUAL",
    actorId: null,
    actorName: name && name.length > 0 ? name : "未填写研判人员",
  };
}

/**
 * 可信 USER Actor：仅来自 Server AuthUser。
 * actorName 为写入时 displayName 快照，之后不随 User 表变更改写。
 */
export function userActor(authUser: AuthUser): AuditActor {
  return {
    actorType: "USER",
    actorId: authUser.id,
    actorName: authUser.displayName,
  };
}

export function truncateSummary(
  text: string,
  max = AUDIT_SUMMARY_MAX_LENGTH,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

/** 纯文本：去掉尖括号标签残留，不做复杂 DLP */
export function asPlainText(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

function withActor(
  actor: AuditActor,
  rest: Omit<BuiltAuditEvent, "actorType" | "actorId" | "actorName">,
): BuiltAuditEvent {
  return {
    ...rest,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorName: actor.actorName,
  };
}

export function buildCaseCreatedAudit(input: {
  caseNumber: string;
  title?: string;
  sourceType?: string | null;
  operationId?: string | null;
  actor: AuditActor;
}): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType: "CASE_CREATED",
    summary: `创建研判案件 ${input.caseNumber}`,
    changes: {
      caseNumber: input.caseNumber,
      ...(input.title ? { title: input.title } : {}),
    },
    metadata: input.sourceType ? { sourceType: input.sourceType } : null,
    operationId: input.operationId ?? null,
  });
}

export function buildStatusChangedAudit(input: {
  from: CaseStatus;
  to: CaseStatus;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  const fromLabel = caseStatusLabels[input.from];
  const toLabel = caseStatusLabels[input.to];
  return withActor(input.actor, {
    actionType: "STATUS_CHANGED",
    summary: `${fromLabel} → ${toLabel}`,
    changes: { from: input.from, to: input.to },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

function checklistAudit(
  actionType:
    | "CHECKLIST_COMPLETED"
    | "CHECKLIST_REOPENED"
    | "CHECKLIST_ADDED"
    | "CHECKLIST_DELETED",
  input: {
    itemId: string;
    label: string;
    actor: AuditActor;
    operationId?: string | null;
  },
): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType,
    summary: truncateSummary(input.label),
    changes: { itemId: input.itemId, label: input.label },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

export function buildChecklistCompletedAudit(input: {
  itemId: string;
  label: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_COMPLETED", input);
}

export function buildChecklistReopenedAudit(input: {
  itemId: string;
  label: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_REOPENED", input);
}

export function buildChecklistAddedAudit(input: {
  itemId: string;
  label: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_ADDED", input);
}

export function buildChecklistDeletedAudit(input: {
  itemId: string;
  label: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_DELETED", input);
}

export function buildEvidencePinAudit(input: {
  evidenceId: string;
  pinned: boolean;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType: input.pinned ? "EVIDENCE_PINNED" : "EVIDENCE_UNPINNED",
    summary: input.pinned ? "标记关键证据" : "取消关键证据",
    changes: { evidenceId: input.evidenceId, pinned: input.pinned },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

export function buildBusinessContextUpdatedAudit(input: {
  fields: string[];
  /** 枚举类字段的新旧值（可选，短值） */
  enumChanges?: Record<string, { from: string | null; to: string | null }>;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  const legitimacy = input.enumChanges?.businessLegitimacy;
  let summary = "业务核查信息已更新";
  if (
    legitimacy &&
    legitimacy.from !== legitimacy.to &&
    legitimacy.from != null &&
    legitimacy.to != null
  ) {
    const from =
      businessLegitimacyLabels[legitimacy.from as BusinessLegitimacy] ??
      legitimacy.from;
    const to =
      businessLegitimacyLabels[legitimacy.to as BusinessLegitimacy] ??
      legitimacy.to;
    summary = `业务合理性：${from} → ${to}`;
  } else if (
    input.enumChanges?.ownerVerification &&
    input.enumChanges.ownerVerification.from !==
      input.enumChanges.ownerVerification.to
  ) {
    const c = input.enumChanges.ownerVerification;
    const from =
      verificationStatusLabels[c.from as VerificationStatus] ?? c.from ?? "—";
    const to =
      verificationStatusLabels[c.to as VerificationStatus] ?? c.to ?? "—";
    summary = `负责人确认：${from} → ${to}`;
  }

  return withActor(input.actor, {
    actionType: "BUSINESS_CONTEXT_UPDATED",
    summary,
    changes: {
      fields: input.fields,
      ...(input.enumChanges ? { enumChanges: input.enumChanges } : {}),
    },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

export function buildHumanReviewUpdatedAudit(input: {
  finalConclusion?: {
    from: FinalConclusion | null;
    to: FinalConclusion | null;
  };
  humanRiskLevel?: { from: RiskLevel | null; to: RiskLevel | null };
  /** 仅说明文本变化（不复制全文） */
  noteUpdated?: boolean;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  const changes: Record<string, unknown> = {};
  let summary = "人工研判已更新";

  if (
    input.finalConclusion &&
    input.finalConclusion.from !== input.finalConclusion.to
  ) {
    changes.finalConclusion = input.finalConclusion;
    const from = input.finalConclusion.from
      ? finalConclusionLabels[input.finalConclusion.from]
      : "尚未形成结论";
    const to = input.finalConclusion.to
      ? finalConclusionLabels[input.finalConclusion.to]
      : "尚未形成结论";
    summary = `人工结论：${from} → ${to}`;
  } else if (
    input.humanRiskLevel &&
    input.humanRiskLevel.from !== input.humanRiskLevel.to
  ) {
    changes.humanRiskLevel = input.humanRiskLevel;
    const from = input.humanRiskLevel.from
      ? riskLevelLabels[input.humanRiskLevel.from]
      : "未评级";
    const to = input.humanRiskLevel.to
      ? riskLevelLabels[input.humanRiskLevel.to]
      : "未评级";
    summary = `人工风险等级：${from} → ${to}`;
  } else if (input.noteUpdated) {
    changes.noteUpdated = true;
    summary = "人工研判说明已更新";
  }

  if (
    input.humanRiskLevel &&
    input.humanRiskLevel.from !== input.humanRiskLevel.to &&
    !changes.humanRiskLevel
  ) {
    changes.humanRiskLevel = input.humanRiskLevel;
  }

  return withActor(input.actor, {
    actionType: "HUMAN_REVIEW_UPDATED",
    summary,
    changes: Object.keys(changes).length > 0 ? changes : null,
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

export function buildTimelineEventAddedAudit(input: {
  eventId: string;
  title: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType: "TIMELINE_EVENT_ADDED",
    summary: truncateSummary(input.title),
    changes: { eventId: input.eventId, title: input.title },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

export function buildReportCreatedAudit(input: {
  caseNumber: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType: "REPORT_CREATED",
    summary: "生成调查报告初稿",
    changes: null,
    metadata: { caseNumber: input.caseNumber },
    operationId: input.operationId ?? null,
  });
}

export function buildReportUpdatedAudit(input: {
  caseNumber: string;
  reportUpdatedAtFrom?: string | null;
  reportUpdatedAtTo?: string | null;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType: "REPORT_UPDATED",
    summary: "更新调查报告",
    changes:
      input.reportUpdatedAtFrom || input.reportUpdatedAtTo
        ? {
            reportUpdatedAt: {
              from: input.reportUpdatedAtFrom ?? null,
              to: input.reportUpdatedAtTo ?? null,
            },
          }
        : null,
    metadata: { caseNumber: input.caseNumber },
    operationId: input.operationId ?? null,
  });
}

export function buildReportExportedAudit(input: {
  caseNumber: string;
  fileName?: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(input.actor, {
    actionType: "REPORT_EXPORTED",
    summary: "导出调查报告",
    changes: null,
    metadata: {
      caseNumber: input.caseNumber,
      ...(input.fileName ? { fileName: input.fileName } : {}),
    },
    operationId: input.operationId ?? null,
  });
}

export function buildHandoffAudit(input: {
  note: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  const plain = asPlainText(input.note);
  if (!plain) {
    throw new Error("交接说明不能为空");
  }
  if (plain.length > HANDOFF_NOTE_MAX_LENGTH) {
    throw new Error(`交接说明不能超过 ${HANDOFF_NOTE_MAX_LENGTH} 字`);
  }

  return withActor(input.actor, {
    actionType: "HANDOFF_NOTE_ADDED",
    summary: truncateSummary(plain),
    changes: null,
    metadata: { note: plain },
    operationId: input.operationId ?? null,
  });
}

function assigneeLabel(name: string | null | undefined, fallback = "未知用户"): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/** 分配 / 重分配案件负责人 */
export function buildCaseAssignedAudit(input: {
  previousAssigneeUserId: string | null;
  previousAssigneeName: string | null;
  newAssigneeUserId: string;
  newAssigneeName: string | null;
  actor: AuditActor;
  operationId?: string | null;
  isSelfClaim?: boolean;
  isAdminReassign?: boolean;
}): BuiltAuditEvent {
  const newName = assigneeLabel(input.newAssigneeName);
  const prevName = assigneeLabel(input.previousAssigneeName);
  let summary: string;
  if (input.isSelfClaim) {
    summary = `${newName}接手了案件`;
  } else if (
    input.isAdminReassign &&
    input.previousAssigneeUserId != null
  ) {
    summary = `管理员将案件负责人从${prevName}调整为${newName}`;
  } else if (input.previousAssigneeUserId == null) {
    summary = `将案件负责人分配给${newName}`;
  } else {
    summary = `将案件负责人从${prevName}调整为${newName}`;
  }

  return withActor(input.actor, {
    actionType: "CASE_ASSIGNED",
    summary: truncateSummary(summary),
    changes: {
      previousAssigneeUserId: input.previousAssigneeUserId,
      previousAssigneeName: input.previousAssigneeName,
      newAssigneeUserId: input.newAssigneeUserId,
      newAssigneeName: input.newAssigneeName,
    },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

/** 释放案件负责人 */
export function buildCaseUnassignedAudit(input: {
  previousAssigneeUserId: string | null;
  previousAssigneeName: string | null;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  const prevName = assigneeLabel(input.previousAssigneeName);
  const actorName = input.actor.actorName?.trim() || "用户";
  const isSelfRelease =
    input.actor.actorType === "USER" &&
    input.actor.actorId != null &&
    input.previousAssigneeUserId === input.actor.actorId;
  const summary = isSelfRelease
    ? `${prevName}释放了案件负责人`
    : `${actorName}将案件释放为未分配`;

  return withActor(input.actor, {
    actionType: "CASE_UNASSIGNED",
    summary: truncateSummary(summary),
    changes: {
      previousAssigneeUserId: input.previousAssigneeUserId,
      previousAssigneeName: input.previousAssigneeName,
      newAssigneeUserId: null,
      newAssigneeName: null,
    },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

function dueAtSummaryLabel(iso: string | null): string {
  if (!iso) return "未设置";
  // 审计摘要用紧凑 UTC+8 墙钟，避免把 ISO 原样塞进文案
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const cn = new Date(date.getTime() + 8 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${cn.getUTCFullYear()}-${pad(cn.getUTCMonth() + 1)}-${pad(cn.getUTCDate())} ${pad(cn.getUTCHours())}:${pad(cn.getUTCMinutes())}`;
}

/** 设置 / 修改 / 清除案件运营截止时间 */
export function buildCaseDueDateChangedAudit(input: {
  previousDueAt: string | null;
  newDueAt: string | null;
  actorName: string;
  actor: AuditActor;
  operationId?: string | null;
}): BuiltAuditEvent {
  const actorName = input.actorName.trim() || "用户";
  let summary: string;
  if (input.previousDueAt == null && input.newDueAt != null) {
    summary = `${actorName}将案件截止时间设置为 ${dueAtSummaryLabel(input.newDueAt)}`;
  } else if (input.previousDueAt != null && input.newDueAt == null) {
    summary = `${actorName}清除了案件截止时间`;
  } else {
    summary = `${actorName}将案件截止时间从 ${dueAtSummaryLabel(input.previousDueAt)} 调整为 ${dueAtSummaryLabel(input.newDueAt)}`;
  }

  return withActor(input.actor, {
    actionType: "CASE_DUE_DATE_CHANGED",
    summary: truncateSummary(summary),
    changes: {
      previousDueAt: input.previousDueAt,
      newDueAt: input.newDueAt,
    },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}
