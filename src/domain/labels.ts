import type {
  BusinessLegitimacy,
  CaseStatus,
  EvidenceSourceType,
  ExistenceStatus,
  FinalConclusion,
  ObservationStatus,
  RiskLevel,
  SecurityDomain,
  VerificationStatus,
} from "./types";

/** 面向用户展示的简体中文文案。UNKNOWN 必须与 NORMAL 明确区分 */

export const observationStatusLabels: Record<ObservationStatus, string> = {
  NORMAL: "未见异常",
  ABNORMAL: "异常 / 可疑",
  UNKNOWN: "数据不足，暂无法判断",
};

export const riskLevelLabels: Record<RiskLevel, string> = {
  LOW: "低风险",
  MEDIUM: "中风险",
  HIGH: "高风险",
  CRITICAL: "严重",
};

/**
 * 面向用户/报告的风险等级展示：
 * UNKNOWN（数据不足无法判断）不得显示“低风险”等等级，统一显示“暂无法评级”。
 */
export function displayRiskLevel(
  status: ObservationStatus,
  riskLevel: RiskLevel,
): string {
  return status === "UNKNOWN" ? "暂无法评级" : riskLevelLabels[riskLevel];
}

export const securityDomainLabels: Record<SecurityDomain, string> = {
  DATA: "数据安全",
  NETWORK: "网络安全",
  IDENTITY: "身份行为",
  BUSINESS: "业务合理性",
};

export const existenceStatusLabels: Record<ExistenceStatus, string> = {
  CONFIRMED: "确认存在",
  NOT_FOUND: "确认不存在",
  UNKNOWN: "未获取信息",
};

export const verificationStatusLabels: Record<VerificationStatus, string> = {
  CONFIRMED: "已确认",
  NOT_CONFIRMED: "未获确认",
  UNKNOWN: "未获取信息",
};

export const businessLegitimacyLabels: Record<BusinessLegitimacy, string> = {
  AUTHORIZED: "已授权",
  UNAUTHORIZED: "确认未授权",
  UNKNOWN: "尚未判断",
};

export const finalConclusionLabels: Record<FinalConclusion, string> = {
  NORMAL_BUSINESS: "正常授权业务行为",
  SUSPECTED_SECURITY_INCIDENT: "疑似安全事件",
  INCONCLUSIVE: "暂无法定论",
};

export const caseStatusLabels: Record<CaseStatus, string> = {
  NEW: "新建",
  INVESTIGATING: "研判中",
  PENDING_VERIFICATION: "待核查",
  PENDING_BUSINESS_CONFIRMATION: "待业务确认",
  RESPONDING: "处置中",
  CLOSED: "已闭环",
};

export const evidenceConfidenceLabels: Record<"LOW" | "MEDIUM" | "HIGH", string> = {
  LOW: "低（多项关键数据缺失）",
  MEDIUM: "中（部分数据缺失）",
  HIGH: "高（关键数据齐全）",
};

export const evidenceSourceTypeLabels: Record<EvidenceSourceType, string> = {
  DATABASE_AUDIT: "数据库审计日志",
  AUTH_LOG: "认证日志",
  NETWORK_LOG: "网络日志",
  BUSINESS_SYSTEM_LOG: "业务系统日志",
  CHANGE_TICKET: "变更工单",
  MANUAL_INPUT: "人工录入",
};
