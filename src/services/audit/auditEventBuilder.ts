/**
 * Audit Event Builder：统一 actionType / summary / changes / metadata / actor。
 * Repository 只负责 append / query；组件不得自行拼审计文案。
 */

import {
  AUDIT_SUMMARY_MAX_LENGTH,
  HANDOFF_NOTE_MAX_LENGTH,
  type AuditActionType,
  type AuditActorType,
} from "@/domain/audit";
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

/** 系统主体 */
export function systemActor(): AuditActor {
  return {
    actorType: "SYSTEM",
    actorId: null,
    actorName: "系统",
  };
}

/**
 * 人工主体（Demo）：取案件 reviewer；非可信认证身份。
 * actorId 恒为 null，直至未来登录接入 USER。
 */
export function manualActor(reviewer?: string | null): AuditActor {
  const name = reviewer?.trim();
  return {
    actorType: "MANUAL",
    actorId: null,
    actorName: name && name.length > 0 ? name : "未填写研判人员",
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
}): BuiltAuditEvent {
  return withActor(systemActor(), {
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
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  const fromLabel = caseStatusLabels[input.from];
  const toLabel = caseStatusLabels[input.to];
  return withActor(manualActor(input.reviewer), {
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
    reviewer?: string | null;
    operationId?: string | null;
  },
): BuiltAuditEvent {
  return withActor(manualActor(input.reviewer), {
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
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_COMPLETED", input);
}

export function buildChecklistReopenedAudit(input: {
  itemId: string;
  label: string;
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_REOPENED", input);
}

export function buildChecklistAddedAudit(input: {
  itemId: string;
  label: string;
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_ADDED", input);
}

export function buildChecklistDeletedAudit(input: {
  itemId: string;
  label: string;
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return checklistAudit("CHECKLIST_DELETED", input);
}

export function buildBusinessContextUpdatedAudit(input: {
  fields: string[];
  /** 枚举类字段的新旧值（可选，短值） */
  enumChanges?: Record<string, { from: string | null; to: string | null }>;
  reviewer?: string | null;
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

  return withActor(manualActor(input.reviewer), {
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
  reviewer?: string | null;
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

  return withActor(manualActor(input.reviewer), {
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
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(manualActor(input.reviewer), {
    actionType: "TIMELINE_EVENT_ADDED",
    summary: truncateSummary(input.title),
    changes: { eventId: input.eventId, title: input.title },
    metadata: null,
    operationId: input.operationId ?? null,
  });
}

export function buildReportCreatedAudit(input: {
  caseNumber: string;
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(manualActor(input.reviewer), {
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
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(manualActor(input.reviewer), {
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
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  return withActor(manualActor(input.reviewer), {
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
  reviewer?: string | null;
  operationId?: string | null;
}): BuiltAuditEvent {
  const plain = asPlainText(input.note);
  if (!plain) {
    throw new Error("交接说明不能为空");
  }
  if (plain.length > HANDOFF_NOTE_MAX_LENGTH) {
    throw new Error(`交接说明不能超过 ${HANDOFF_NOTE_MAX_LENGTH} 字`);
  }

  return withActor(manualActor(input.reviewer), {
    actionType: "HANDOFF_NOTE_ADDED",
    summary: truncateSummary(plain),
    changes: null,
    metadata: { note: plain },
    operationId: input.operationId ?? null,
  });
}
