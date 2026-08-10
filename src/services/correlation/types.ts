/**
 * v1.8 M1：历史案件关联 DTO。
 * reason code 为稳定 identity；中文展示由 UI label 负责。
 */

import type { CaseStatus, RiskLevel } from "@/domain/types";

export type RelatedCaseReasonCode =
  | "SAME_USERNAME"
  | "SAME_SOURCE_IP"
  | "SHARED_SYSTEM"
  | "SAME_EXTERNAL_ALERT_ID"
  | "SAME_ALERT_SOURCE";

export type RelatedCaseReason = {
  code: RelatedCaseReasonCode;
  /** 匹配到的事实值（账号 / IP / 系统名 / 告警来源 / 外部告警 ID） */
  value: string;
};

export type RelatedCaseItem = {
  caseId: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  suggestedRiskLevel: RiskLevel | null;
  humanRiskLevel: RiskLevel | null;
  lastActivityAt: string;
  reasons: RelatedCaseReason[];
};

/** 关联计算用的规范化事实（null = 缺失，不得参与匹配） */
export type CorrelationCaseFacts = {
  caseId: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  suggestedRiskLevel: RiskLevel | null;
  humanRiskLevel: RiskLevel | null;
  lastActivityAt: string;
  username: string | null;
  sourceIp: string | null;
  accessedSystems: string[];
  alertSource: string | null;
  originalAlertId: string | null;
};

export const RELATED_CASES_WINDOW_DAYS = 30;
export const RELATED_CASES_RESULT_CAP = 5;
/** 服务端扫描最近案件的安全上限（非 Client 全量拉取） */
export const RELATED_CASES_SCAN_CAP = 200;
