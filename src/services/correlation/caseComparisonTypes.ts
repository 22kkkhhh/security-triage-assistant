/**
 * v1.9 M1：两案对比调查 DTO。
 * code = 稳定 identity；中文展示由 UI label 负责。
 */

import type {
  CaseStatus,
  FinalConclusion,
  HumanReview,
  RiskLevel,
  SuggestedAssessment,
} from "@/domain/types";
import type { RelatedCaseReason } from "./types";

export type ComparisonFactCategory =
  | "ALERT"
  | "IDENTITY"
  | "NETWORK"
  | "DATA"
  | "BUSINESS";

/** 共同事实字段 code（含 v1.8 correlation reason + 扩展等值字段） */
export type ComparisonSharedFactCode =
  | "SAME_USERNAME"
  | "SAME_SOURCE_IP"
  | "SHARED_SYSTEM"
  | "SAME_EXTERNAL_ALERT_ID"
  | "SAME_ALERT_SOURCE"
  | "SAME_ALERT_SEVERITY"
  | "SAME_ALERT_TIME"
  | "SAME_DATABASE"
  | "SAME_TABLE"
  | "SAME_OPERATION"
  | "SAME_EXTERNAL_COMMUNICATION"
  | "SAME_EXTERNAL_DESTINATION"
  | "SAME_CHANGE_TICKET"
  | "SAME_BUSINESS_LEGITIMACY"
  | "SAME_PLANNED_TASK_STATUS"
  | "SAME_OWNER_VERIFICATION";

export type ComparisonDiffFieldCode =
  | "USERNAME"
  | "SOURCE_IP"
  | "ACCESSED_SYSTEMS"
  | "ALERT_SOURCE"
  | "EXTERNAL_ALERT_ID"
  | "ALERT_SEVERITY"
  | "ALERT_TIME"
  | "EXTERNAL_COMMUNICATION"
  | "EXTERNAL_DESTINATION"
  | "INTERNAL_SOURCE_IP"
  | "DATABASE"
  | "TABLE"
  | "OPERATION"
  | "ROWS_AFFECTED"
  | "SENSITIVE_DATA_TYPES"
  | "CHANGE_TICKET_ID"
  | "CHANGE_TICKET_STATUS"
  | "PLANNED_TASK_STATUS"
  | "OWNER_VERIFICATION"
  | "BUSINESS_LEGITIMACY"
  | "BUSINESS_OWNER";

export type ComparisonSharedFact = {
  code: ComparisonSharedFactCode;
  category: ComparisonFactCategory;
  value: string;
};

export type ComparisonFactDifference = {
  fieldCode: ComparisonDiffFieldCode;
  category: ComparisonFactCategory;
  /** null = 展示「暂缺信息」 */
  currentValue: string | null;
  relatedValue: string | null;
};

export type ComparisonCaseSummary = {
  caseId: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  role: "CURRENT" | "HISTORICAL";
  suggestedRiskLevel: RiskLevel | null;
  humanRiskLevel: RiskLevel | null;
  humanConclusion: FinalConclusion | null;
  hasReport: boolean;
  suggestedAssessment: SuggestedAssessment | null;
  humanReview: HumanReview | null;
};

export type CaseComparisonView = {
  sameCase: boolean;
  stronglyRelated: boolean;
  current: ComparisonCaseSummary;
  related: ComparisonCaseSummary;
  sharedFacts: ComparisonSharedFact[];
  differentFacts: ComparisonFactDifference[];
  correlationReasons: RelatedCaseReason[];
};
