/**
 * v1.8 M2：历史调查线索 DTO。
 * code = 稳定 identity；中文由 UI label 负责。
 */

import type { RelatedCaseItem } from "./types";

export type HistoricalSignalCode =
  | "RECURRING_USERNAME"
  | "RECURRING_SOURCE_IP"
  | "RECURRING_SYSTEM"
  | "REPEATED_EXTERNAL_ALERT_ID";

export type HistoricalSignal = {
  code: HistoricalSignalCode;
  value: string;
  relatedCaseCount: number;
  relatedCaseIds: string[];
};

export type InvestigationLeadCode =
  | "VERIFY_RECURRING_ACCOUNT"
  | "VERIFY_SOURCE_IP_OWNERSHIP"
  | "COMPARE_SHARED_SYSTEM_ACTIVITY"
  | "CHECK_DUPLICATE_ALERT_PROVENANCE"
  | "REVIEW_RELATED_CASE_TIMELINES";

export type InvestigationLead = {
  code: InvestigationLeadCode;
};

/** 仅用于排序提示，不得改写 SuggestedAssessment / HumanReview */
export type CurrentAnalysisHints = {
  hasIdentityAbnormal: boolean;
  hasNetworkAbnormal: boolean;
  hasDataAbnormal: boolean;
};

export type InvestigationIntelligenceView = {
  relatedCases: RelatedCaseItem[];
  relatedCaseCount: number;
  signals: HistoricalSignal[];
  leads: InvestigationLead[];
};

export const INVESTIGATION_LEADS_CAP = 4;
