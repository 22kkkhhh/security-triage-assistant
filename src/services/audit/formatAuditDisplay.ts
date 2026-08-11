/**
 * Audit 展示层格式化：内部 enum → 简体中文，禁止在 UI 暴露原始枚举 / JSON。
 */

import {
  auditActionTypeLabels,
  isAuditActionType,
  type AuditActionType,
} from "@/domain/audit";
import {
  businessLegitimacyLabels,
  caseStatusLabels,
  existenceStatusLabels,
  finalConclusionLabels,
  riskLevelLabels,
  verificationStatusLabels,
} from "@/domain/labels";
import type { CaseStatus, FinalConclusion, RiskLevel } from "@/domain/types";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function labelCaseStatus(value: unknown): string {
  if (typeof value === "string" && value in caseStatusLabels) {
    return caseStatusLabels[value as CaseStatus];
  }
  return "未知状态";
}

function labelRisk(value: unknown): string {
  if (value == null) return "暂无法评级";
  if (typeof value === "string" && value in riskLevelLabels) {
    return riskLevelLabels[value as RiskLevel];
  }
  return "暂无法评级";
}

function labelConclusion(value: unknown): string {
  if (value == null) return "尚未形成结论";
  if (typeof value === "string" && value in finalConclusionLabels) {
    return finalConclusionLabels[value as FinalConclusion];
  }
  return "尚未形成结论";
}

function labelBusinessField(field: string, value: unknown): string {
  if (typeof value !== "string") return "—";
  if (field === "businessLegitimacy" && value in businessLegitimacyLabels) {
    return businessLegitimacyLabels[
      value as keyof typeof businessLegitimacyLabels
    ];
  }
  if (
    (field === "plannedTaskStatus" || field === "changeTicketStatus") &&
    value in existenceStatusLabels
  ) {
    return existenceStatusLabels[value as keyof typeof existenceStatusLabels];
  }
  if (field === "ownerVerification" && value in verificationStatusLabels) {
    return verificationStatusLabels[
      value as keyof typeof verificationStatusLabels
    ];
  }
  return "—";
}

const BC_FIELD_LABELS: Record<string, string> = {
  plannedTaskStatus: "计划任务",
  changeTicketStatus: "变更工单",
  ownerVerification: "负责人确认",
  businessLegitimacy: "业务合理性",
};

function fromToLine(
  from: unknown,
  to: unknown,
  labelFrom: (v: unknown) => string,
): string {
  return `${labelFrom(from)} → ${labelFrom(to)}`;
}

/** actionType → 中文操作名 */
export function formatAuditActionLabel(actionType: string): string {
  if (isAuditActionType(actionType)) {
    return auditActionTypeLabels[actionType];
  }
  return "操作记录";
}

/** actor 展示名（USER/MANUAL 使用写入时 snapshot，不 join User 表） */
export function formatAuditActorName(log: CaseAuditLogView): string {
  if (log.actorType === "SYSTEM") return "系统";
  if (log.actorType === "USER") {
    return log.actorName?.trim() || "认证用户";
  }
  return log.actorName?.trim() || "未填写研判人员";
}

/** 时间展示（无 T/Z/毫秒） */
export function formatAuditTime(iso: string): string {
  return formatDateTimeForDisplay(iso);
}

/**
 * 将 changes / metadata 转为用户可读摘要行。
 * 不返回 operationId / 原始 JSON。
 */
export function formatAuditChangesForDisplay(
  log: CaseAuditLogView,
): string[] {
  const action = log.actionType as AuditActionType;
  const changes = asRecord(log.changes);
  const metadata = asRecord(log.metadata);
  const lines: string[] = [];

  switch (action) {
    case "CASE_CREATED": {
      const caseNumber =
        (changes?.caseNumber as string | undefined) ||
        (metadata?.caseNumber as string | undefined);
      if (caseNumber) lines.push(caseNumber);
      else if (log.summary) lines.push(log.summary);
      break;
    }
    case "STATUS_CHANGED": {
      if (changes?.from != null || changes?.to != null) {
        lines.push(
          fromToLine(changes?.from, changes?.to, labelCaseStatus),
        );
      } else if (log.summary) {
        lines.push(log.summary);
      }
      break;
    }
    case "CASE_ASSIGNED":
    case "CASE_UNASSIGNED": {
      if (log.summary) lines.push(log.summary);
      break;
    }
    case "CHECKLIST_COMPLETED":
    case "CHECKLIST_REOPENED":
    case "CHECKLIST_ADDED":
    case "CHECKLIST_DELETED": {
      const label =
        (changes?.label as string | undefined) ||
        (changes?.title as string | undefined);
      if (label) lines.push(`核查项：${label}`);
      else if (log.summary) lines.push(log.summary);
      break;
    }
    case "BUSINESS_CONTEXT_UPDATED": {
      if (changes) {
        for (const [field, raw] of Object.entries(changes)) {
          if (field === "fields" || field === "enumChanges") continue;
          const pair = asRecord(raw);
          if (pair && ("from" in pair || "to" in pair)) {
            const name = BC_FIELD_LABELS[field] ?? "业务核查";
            lines.push(
              `${name}：${labelBusinessField(field, pair.from)} → ${labelBusinessField(field, pair.to)}`,
            );
          }
        }
        const enumChanges = asRecord(changes.enumChanges);
        if (enumChanges) {
          for (const [field, raw] of Object.entries(enumChanges)) {
            const pair = asRecord(raw);
            if (!pair) continue;
            const name = BC_FIELD_LABELS[field] ?? "业务核查";
            lines.push(
              `${name}：${labelBusinessField(field, pair.from)} → ${labelBusinessField(field, pair.to)}`,
            );
          }
        }
      }
      if (lines.length === 0 && log.summary) lines.push(log.summary);
      break;
    }
    case "HUMAN_REVIEW_UPDATED": {
      const fc = asRecord(changes?.finalConclusion);
      if (fc) {
        lines.push(
          `人工结论：${fromToLine(fc.from, fc.to, labelConclusion)}`,
        );
      }
      const risk = asRecord(changes?.humanRiskLevel);
      if (risk) {
        lines.push(
          `人工风险：${fromToLine(risk.from, risk.to, labelRisk)}`,
        );
      }
      if (lines.length === 0 && log.summary) lines.push(log.summary);
      break;
    }
    case "TIMELINE_EVENT_ADDED": {
      const title = changes?.title as string | undefined;
      if (title) lines.push(title);
      else if (log.summary) lines.push(log.summary);
      break;
    }
    case "REPORT_CREATED":
    case "REPORT_UPDATED":
    case "REPORT_EXPORTED": {
      const caseNumber = metadata?.caseNumber as string | undefined;
      if (caseNumber) lines.push(caseNumber);
      else if (log.summary) lines.push(log.summary);
      break;
    }
    case "HANDOFF_NOTE_ADDED": {
      if (log.summary) lines.push(log.summary);
      break;
    }
    default:
      if (log.summary) lines.push(log.summary);
  }

  return lines;
}

/** 最新交接正文：优先 metadata.note，否则 summary */
export function formatHandoffNoteBody(log: CaseAuditLogView): string {
  const metadata = asRecord(log.metadata);
  const note = metadata?.note;
  if (typeof note === "string" && note.trim()) return note;
  return log.summary || "";
}
