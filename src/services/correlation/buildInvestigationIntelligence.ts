/**
 * 基于 Related Cases 的确定性 Historical Signals + Investigation Leads。
 * 纯函数：无 DB / 无 Date.now() / 无随机；不修改风险或 HumanReview。
 */

import type { RelatedCaseItem, RelatedCaseReasonCode } from "./types";
import {
  INVESTIGATION_LEADS_CAP,
  type CurrentAnalysisHints,
  type HistoricalSignal,
  type HistoricalSignalCode,
  type InvestigationIntelligenceView,
  type InvestigationLead,
  type InvestigationLeadCode,
} from "./investigationIntelligenceTypes";

const REASON_TO_SIGNAL: Partial<
  Record<RelatedCaseReasonCode, HistoricalSignalCode>
> = {
  SAME_USERNAME: "RECURRING_USERNAME",
  SAME_SOURCE_IP: "RECURRING_SOURCE_IP",
  SHARED_SYSTEM: "RECURRING_SYSTEM",
  SAME_EXTERNAL_ALERT_ID: "REPEATED_EXTERNAL_ALERT_ID",
  // SAME_ALERT_SOURCE intentionally omitted — 不得单独生成重复活动信号
};

const SIGNAL_TO_LEAD: Record<HistoricalSignalCode, InvestigationLeadCode> = {
  REPEATED_EXTERNAL_ALERT_ID: "CHECK_DUPLICATE_ALERT_PROVENANCE",
  RECURRING_SOURCE_IP: "VERIFY_SOURCE_IP_OWNERSHIP",
  RECURRING_USERNAME: "VERIFY_RECURRING_ACCOUNT",
  RECURRING_SYSTEM: "COMPARE_SHARED_SYSTEM_ACTIVITY",
};

/** 默认 lead 优先级（数字越小越靠前） */
const LEAD_BASE_PRIORITY: Record<InvestigationLeadCode, number> = {
  CHECK_DUPLICATE_ALERT_PROVENANCE: 10,
  VERIFY_SOURCE_IP_OWNERSHIP: 20,
  VERIFY_RECURRING_ACCOUNT: 30,
  COMPARE_SHARED_SYSTEM_ACTIVITY: 40,
  REVIEW_RELATED_CASE_TIMELINES: 50,
};

function aggregationKey(code: HistoricalSignalCode, value: string): string {
  if (
    code === "RECURRING_USERNAME" ||
    code === "RECURRING_SOURCE_IP" ||
    code === "RECURRING_SYSTEM"
  ) {
    return `${code}:${value.toLowerCase()}`;
  }
  return `${code}:${value}`;
}

export function aggregateHistoricalSignals(
  relatedCases: readonly RelatedCaseItem[],
): HistoricalSignal[] {
  type Acc = {
    code: HistoricalSignalCode;
    value: string;
    caseIds: Set<string>;
  };
  const map = new Map<string, Acc>();

  for (const item of relatedCases) {
    for (const reason of item.reasons) {
      const signalCode = REASON_TO_SIGNAL[reason.code];
      if (!signalCode) continue;
      const key = aggregationKey(signalCode, reason.value);
      let acc = map.get(key);
      if (!acc) {
        acc = {
          code: signalCode,
          value: reason.value,
          caseIds: new Set<string>(),
        };
        map.set(key, acc);
      }
      acc.caseIds.add(item.caseId);
    }
  }

  const signals: HistoricalSignal[] = [...map.values()].map((acc) => ({
    code: acc.code,
    value: acc.value,
    relatedCaseCount: acc.caseIds.size,
    relatedCaseIds: [...acc.caseIds].sort(),
  }));

  signals.sort((a, b) => {
    if (b.relatedCaseCount !== a.relatedCaseCount) {
      return b.relatedCaseCount - a.relatedCaseCount;
    }
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return a.value.localeCompare(b.value, "en");
  });

  return signals;
}

function leadPriority(
  code: InvestigationLeadCode,
  hints: CurrentAnalysisHints | undefined,
): number {
  let priority = LEAD_BASE_PRIORITY[code];
  if (!hints) return priority;
  if (code === "VERIFY_RECURRING_ACCOUNT" && hints.hasIdentityAbnormal) {
    priority -= 8;
  }
  if (code === "VERIFY_SOURCE_IP_OWNERSHIP" && hints.hasNetworkAbnormal) {
    priority -= 8;
  }
  if (code === "COMPARE_SHARED_SYSTEM_ACTIVITY" && hints.hasDataAbnormal) {
    priority -= 8;
  }
  return priority;
}

export function buildInvestigationLeads(
  relatedCases: readonly RelatedCaseItem[],
  signals: readonly HistoricalSignal[],
  hints?: CurrentAnalysisHints,
  options?: { limit?: number },
): InvestigationLead[] {
  const limit = options?.limit ?? INVESTIGATION_LEADS_CAP;
  const leadCodes = new Set<InvestigationLeadCode>();

  for (const signal of signals) {
    leadCodes.add(SIGNAL_TO_LEAD[signal.code]);
  }

  if (relatedCases.length >= 2) {
    leadCodes.add("REVIEW_RELATED_CASE_TIMELINES");
  }

  const leads = [...leadCodes].map((code) => ({ code }));
  leads.sort((a, b) => {
    const pa = leadPriority(a.code, hints);
    const pb = leadPriority(b.code, hints);
    if (pa !== pb) return pa - pb;
    return a.code.localeCompare(b.code);
  });

  return leads.slice(0, limit);
}

/**
 * Related Cases → Historical Signals → Investigation Leads。
 * 0 related → 空 signals / leads；不虚构线索。
 */
export function buildInvestigationIntelligence(input: {
  relatedCases: readonly RelatedCaseItem[];
  currentAnalysis?: CurrentAnalysisHints;
}): InvestigationIntelligenceView {
  const relatedCases = [...input.relatedCases];
  if (relatedCases.length === 0) {
    return {
      relatedCases: [],
      relatedCaseCount: 0,
      signals: [],
      leads: [],
    };
  }

  const signals = aggregateHistoricalSignals(relatedCases);
  const leads = buildInvestigationLeads(
    relatedCases,
    signals,
    input.currentAnalysis,
  );

  return {
    relatedCases,
    relatedCaseCount: relatedCases.length,
    signals,
    leads,
  };
}
