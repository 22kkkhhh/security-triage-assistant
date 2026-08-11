/**
 * 两案对比：纯函数，无 DB / 无 Date.now() / 无写入。
 * Shared facts 优先复用 v1.8 correlateCasePair；字段差异单独列出。
 */

import type {
  AlertInfo,
  BusinessContext,
  CaseStatus,
  DataContext,
  HumanReview,
  IdentityContext,
  NetworkContext,
  RiskLevel,
  SuggestedAssessment,
} from "@/domain/types";
import {
  correlateCasePair,
  normalizeAccessedSystems,
  normalizeCorrelationToken,
} from "./findRelatedCases";
import type { CorrelationCaseFacts } from "./types";
import type {
  CaseComparisonView,
  ComparisonCaseSummary,
  ComparisonDiffFieldCode,
  ComparisonFactCategory,
  ComparisonFactDifference,
  ComparisonSharedFact,
  ComparisonSharedFactCode,
} from "./caseComparisonTypes";

export type ComparisonCaseSource = {
  id: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  hasReport: boolean;
  suggestedRiskLevel: RiskLevel | null;
  humanRiskLevel: RiskLevel | null;
  alert: AlertInfo;
  identity: IdentityContext;
  network: NetworkContext;
  data: DataContext;
  business: BusinessContext;
  suggestedAssessment: SuggestedAssessment | null;
  humanReview: HumanReview | null;
  /** 关联事实提取结果（调用方用 extractCorrelationFacts） */
  correlationFacts: CorrelationCaseFacts;
};

function displayToken(value: string | null | undefined): string | null {
  return normalizeCorrelationToken(value);
}

function displayNumber(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return String(value);
}

function displayList(values: readonly string[]): string | null {
  const normalized = normalizeAccessedSystems(values);
  if (normalized.length === 0) return null;
  return normalized.join(" / ");
}

function equalToken(
  a: string | null,
  b: string | null,
  caseInsensitive = false,
): boolean {
  if (a == null || b == null) return false;
  if (caseInsensitive) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function pushShared(
  out: ComparisonSharedFact[],
  code: ComparisonSharedFactCode,
  category: ComparisonFactCategory,
  value: string,
) {
  out.push({ code, category, value });
}

function pushDiff(
  out: ComparisonFactDifference[],
  fieldCode: ComparisonDiffFieldCode,
  category: ComparisonFactCategory,
  currentValue: string | null,
  relatedValue: string | null,
) {
  // null/null → 不构成差异，也不构成共同事实
  if (currentValue == null && relatedValue == null) return;
  if (currentValue === relatedValue) return;
  out.push({ fieldCode, category, currentValue, relatedValue });
}

function compareOptionalText(input: {
  shared: ComparisonSharedFact[];
  diffs: ComparisonFactDifference[];
  sharedCode: ComparisonSharedFactCode;
  diffCode: ComparisonDiffFieldCode;
  category: ComparisonFactCategory;
  current: string | null;
  related: string | null;
  caseInsensitive?: boolean;
}) {
  const {
    shared,
    diffs,
    sharedCode,
    diffCode,
    category,
    current,
    related,
    caseInsensitive = false,
  } = input;
  if (current == null && related == null) return;
  if (equalToken(current, related, caseInsensitive)) {
    pushShared(shared, sharedCode, category, current!);
    return;
  }
  pushDiff(diffs, diffCode, category, current, related);
}

function systemsExclusive(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const rightKeys = new Set(right.map((s) => s.toLowerCase()));
  return left.filter((s) => !rightKeys.has(s.toLowerCase()));
}

function toSummary(
  source: ComparisonCaseSource,
  role: "CURRENT" | "HISTORICAL",
): ComparisonCaseSummary {
  return {
    caseId: source.id,
    caseNumber: source.caseNumber,
    title: source.title,
    status: source.status,
    role,
    suggestedRiskLevel:
      source.suggestedAssessment?.suggestedRiskLevel ??
      source.suggestedRiskLevel,
    humanRiskLevel:
      source.humanReview?.humanRiskLevel ?? source.humanRiskLevel,
    humanConclusion: source.humanReview?.finalConclusion ?? null,
    hasReport: source.hasReport,
    suggestedAssessment: source.suggestedAssessment,
    humanReview: source.humanReview,
  };
}

/**
 * 构建两案对比视图。sameCase 时不声称关联，返回稳定空事实。
 */
export function buildCaseComparison(input: {
  current: ComparisonCaseSource;
  related: ComparisonCaseSource;
}): CaseComparisonView {
  const { current, related } = input;

  if (current.id === related.id) {
    const summary = toSummary(current, "CURRENT");
    return {
      sameCase: true,
      stronglyRelated: false,
      current: summary,
      related: { ...summary, role: "HISTORICAL" },
      sharedFacts: [],
      differentFacts: [],
      correlationReasons: [],
    };
  }

  const pair = correlateCasePair(
    current.correlationFacts,
    related.correlationFacts,
  );

  const sharedFacts: ComparisonSharedFact[] = [];
  const differentFacts: ComparisonFactDifference[] = [];

  // —— 共同事实：优先 v1.8 correlation reasons ——
  for (const reason of pair.reasons) {
    const category: ComparisonFactCategory =
      reason.code === "SAME_USERNAME" ||
      reason.code === "SAME_SOURCE_IP" ||
      reason.code === "SHARED_SYSTEM"
        ? "IDENTITY"
        : "ALERT";
    pushShared(sharedFacts, reason.code, category, reason.value);
  }

  const correlationCodes = new Set(pair.reasons.map((r) => r.code));

  // —— Alert ——
  const curAlert = current.alert;
  const relAlert = related.alert;

  if (!correlationCodes.has("SAME_ALERT_SOURCE")) {
    compareOptionalText({
      shared: sharedFacts,
      diffs: differentFacts,
      sharedCode: "SAME_ALERT_SOURCE",
      diffCode: "ALERT_SOURCE",
      category: "ALERT",
      current: displayToken(curAlert.source),
      related: displayToken(relAlert.source),
    });
  } else {
    // 已作为 correlation shared；若仅附加 reason，不重复 diff
  }

  if (!correlationCodes.has("SAME_EXTERNAL_ALERT_ID")) {
    compareOptionalText({
      shared: sharedFacts,
      diffs: differentFacts,
      sharedCode: "SAME_EXTERNAL_ALERT_ID",
      diffCode: "EXTERNAL_ALERT_ID",
      category: "ALERT",
      current: displayToken(curAlert.originalAlertId),
      related: displayToken(relAlert.originalAlertId),
    });
  }

  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_ALERT_SEVERITY",
    diffCode: "ALERT_SEVERITY",
    category: "ALERT",
    current: curAlert.severity,
    related: relAlert.severity,
  });

  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_ALERT_TIME",
    diffCode: "ALERT_TIME",
    category: "ALERT",
    current: displayToken(curAlert.occurredAt),
    related: displayToken(relAlert.occurredAt),
  });

  // —— Identity ——
  const curUser =
    displayToken(current.identity.accountName) ??
    displayToken(current.correlationFacts.username);
  const relUser =
    displayToken(related.identity.accountName) ??
    displayToken(related.correlationFacts.username);
  if (!correlationCodes.has("SAME_USERNAME")) {
    compareOptionalText({
      shared: sharedFacts,
      diffs: differentFacts,
      sharedCode: "SAME_USERNAME",
      diffCode: "USERNAME",
      category: "IDENTITY",
      current: curUser,
      related: relUser,
      caseInsensitive: true,
    });
  }

  const curIp =
    displayToken(current.identity.loginSourceIp) ??
    displayToken(current.correlationFacts.sourceIp);
  const relIp =
    displayToken(related.identity.loginSourceIp) ??
    displayToken(related.correlationFacts.sourceIp);
  if (!correlationCodes.has("SAME_SOURCE_IP")) {
    compareOptionalText({
      shared: sharedFacts,
      diffs: differentFacts,
      sharedCode: "SAME_SOURCE_IP",
      diffCode: "SOURCE_IP",
      category: "IDENTITY",
      current: curIp,
      related: relIp,
      caseInsensitive: true,
    });
  }

  const curSystems = normalizeAccessedSystems(
    current.identity.accessedSystems.length > 0
      ? current.identity.accessedSystems
      : current.correlationFacts.accessedSystems,
  );
  const relSystems = normalizeAccessedSystems(
    related.identity.accessedSystems.length > 0
      ? related.identity.accessedSystems
      : related.correlationFacts.accessedSystems,
  );
  const curOnly = systemsExclusive(curSystems, relSystems);
  const relOnly = systemsExclusive(relSystems, curSystems);
  if (curOnly.length > 0 || relOnly.length > 0) {
    pushDiff(
      differentFacts,
      "ACCESSED_SYSTEMS",
      "IDENTITY",
      displayList(curSystems),
      displayList(relSystems),
    );
  }

  // —— Network（仅现有 Domain 字段）——
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_EXTERNAL_COMMUNICATION",
    diffCode: "EXTERNAL_COMMUNICATION",
    category: "NETWORK",
    current: current.network.externalCommunication,
    related: related.network.externalCommunication,
  });
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_EXTERNAL_DESTINATION",
    diffCode: "EXTERNAL_DESTINATION",
    category: "NETWORK",
    current: displayToken(current.network.externalDestination),
    related: displayToken(related.network.externalDestination),
    caseInsensitive: true,
  });
  {
    const c = displayToken(current.network.internalSourceIp);
    const r = displayToken(related.network.internalSourceIp);
    if (!(c == null && r == null) && !equalToken(c, r, true)) {
      pushDiff(differentFacts, "INTERNAL_SOURCE_IP", "NETWORK", c, r);
    }
  }

  // —— Data ——
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_DATABASE",
    diffCode: "DATABASE",
    category: "DATA",
    current: displayToken(current.data.databaseName),
    related: displayToken(related.data.databaseName),
    caseInsensitive: true,
  });
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_TABLE",
    diffCode: "TABLE",
    category: "DATA",
    current: displayToken(current.data.tableName),
    related: displayToken(related.data.tableName),
    caseInsensitive: true,
  });
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_OPERATION",
    diffCode: "OPERATION",
    category: "DATA",
    current: displayToken(current.data.operationType),
    related: displayToken(related.data.operationType),
    caseInsensitive: true,
  });
  {
    const c = displayNumber(current.data.accessedRecordCount);
    const r = displayNumber(related.data.accessedRecordCount);
    if (!(c == null && r == null) && c !== r) {
      pushDiff(differentFacts, "ROWS_AFFECTED", "DATA", c, r);
    }
  }
  {
    const c = displayList(current.data.sensitiveFieldTypes);
    const r = displayList(related.data.sensitiveFieldTypes);
    if (!(c == null && r == null) && c !== r) {
      pushDiff(differentFacts, "SENSITIVE_DATA_TYPES", "DATA", c, r);
    }
  }

  // —— Business ——
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_CHANGE_TICKET",
    diffCode: "CHANGE_TICKET_ID",
    category: "BUSINESS",
    current: displayToken(current.business.changeTicketId),
    related: displayToken(related.business.changeTicketId),
  });
  {
    const c = current.business.changeTicketStatus;
    const r = related.business.changeTicketStatus;
    if (c !== r) {
      pushDiff(differentFacts, "CHANGE_TICKET_STATUS", "BUSINESS", c, r);
    }
  }
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_PLANNED_TASK_STATUS",
    diffCode: "PLANNED_TASK_STATUS",
    category: "BUSINESS",
    current: current.business.plannedTaskStatus,
    related: related.business.plannedTaskStatus,
  });
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_OWNER_VERIFICATION",
    diffCode: "OWNER_VERIFICATION",
    category: "BUSINESS",
    current: current.business.ownerVerification,
    related: related.business.ownerVerification,
  });
  compareOptionalText({
    shared: sharedFacts,
    diffs: differentFacts,
    sharedCode: "SAME_BUSINESS_LEGITIMACY",
    diffCode: "BUSINESS_LEGITIMACY",
    category: "BUSINESS",
    current: current.business.businessLegitimacy,
    related: related.business.businessLegitimacy,
  });
  {
    const c = displayToken(current.business.businessOwner);
    const r = displayToken(related.business.businessOwner);
    if (!(c == null && r == null) && !equalToken(c, r, true)) {
      pushDiff(differentFacts, "BUSINESS_OWNER", "BUSINESS", c, r);
    }
  }

  // 稳定排序
  sharedFacts.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return a.value.localeCompare(b.value, "en");
  });
  differentFacts.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.fieldCode.localeCompare(b.fieldCode);
  });

  return {
    sameCase: false,
    stronglyRelated: pair.stronglyRelated,
    current: toSummary(current, "CURRENT"),
    related: toSummary(related, "HISTORICAL"),
    sharedFacts,
    differentFacts,
    correlationReasons: pair.reasons,
  };
}

/** 测试/调用方可引用的空值展示约定 */
export const COMPARISON_MISSING_LABEL = "暂缺信息";
