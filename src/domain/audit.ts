/**
 * 案件操作审计领域类型。
 * 与 Timeline 分离：Timeline = 安全事件本身；Audit = 研判/运营操作。
 */

/** 审计动作类型（精简集合；SQLite 以 String 存储） */
export type AuditActionType =
  | "CASE_CREATED"
  | "STATUS_CHANGED"
  | "CHECKLIST_COMPLETED"
  | "CHECKLIST_REOPENED"
  | "CHECKLIST_ADDED"
  | "CHECKLIST_DELETED"
  | "BUSINESS_CONTEXT_UPDATED"
  | "HUMAN_REVIEW_UPDATED"
  | "TIMELINE_EVENT_ADDED"
  | "REPORT_CREATED"
  | "REPORT_UPDATED"
  | "REPORT_EXPORTED"
  | "HANDOFF_NOTE_ADDED";

/**
 * 操作主体类型。
 * USER = 认证用户写入时快照；MANUAL = Legacy / Seed；SYSTEM = 系统创建。
 */
export type AuditActorType = "SYSTEM" | "MANUAL" | "USER";

export const AUDIT_ACTION_TYPES: readonly AuditActionType[] = [
  "CASE_CREATED",
  "STATUS_CHANGED",
  "CHECKLIST_COMPLETED",
  "CHECKLIST_REOPENED",
  "CHECKLIST_ADDED",
  "CHECKLIST_DELETED",
  "BUSINESS_CONTEXT_UPDATED",
  "HUMAN_REVIEW_UPDATED",
  "TIMELINE_EVENT_ADDED",
  "REPORT_CREATED",
  "REPORT_UPDATED",
  "REPORT_EXPORTED",
  "HANDOFF_NOTE_ADDED",
] as const;

export const auditActionTypeLabels: Record<AuditActionType, string> = {
  CASE_CREATED: "创建研判案件",
  STATUS_CHANGED: "修改案件状态",
  CHECKLIST_COMPLETED: "完成核查事项",
  CHECKLIST_REOPENED: "重新打开核查事项",
  CHECKLIST_ADDED: "添加核查事项",
  CHECKLIST_DELETED: "删除核查事项",
  BUSINESS_CONTEXT_UPDATED: "更新业务核查信息",
  HUMAN_REVIEW_UPDATED: "更新人工研判",
  TIMELINE_EVENT_ADDED: "添加事件时间线",
  REPORT_CREATED: "生成调查报告",
  REPORT_UPDATED: "更新调查报告",
  REPORT_EXPORTED: "导出调查报告",
  HANDOFF_NOTE_ADDED: "添加交接记录",
};

export const auditActorTypeLabels: Record<AuditActorType, string> = {
  SYSTEM: "系统",
  MANUAL: "人工（未认证）",
  USER: "认证用户",
};

/** 交接说明最大长度（字） */
export const HANDOFF_NOTE_MAX_LENGTH = 2000;

/** Audit summary 摘要最大长度（字） */
export const AUDIT_SUMMARY_MAX_LENGTH = 80;

/** listCaseAuditLogs 默认分页大小 */
export const AUDIT_LOG_DEFAULT_LIMIT = 40;

/** listCaseAuditLogs 单次上限 */
export const AUDIT_LOG_MAX_LIMIT = 100;

export function isAuditActionType(value: string): value is AuditActionType {
  return (AUDIT_ACTION_TYPES as readonly string[]).includes(value);
}

export function isAuditActorType(value: string): value is AuditActorType {
  return value === "SYSTEM" || value === "MANUAL" || value === "USER";
}
