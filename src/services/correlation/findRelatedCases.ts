/**
 * 历史案件确定性关联（无 AI / 无概率分）。
 * same alert source alone 不足以入选；null/空不得互配。
 */

import {
  RELATED_CASES_RESULT_CAP,
  type CorrelationCaseFacts,
  type RelatedCaseItem,
  type RelatedCaseReason,
  type RelatedCaseReasonCode,
} from "./types";

const STRONG_REASON_CODES: ReadonlySet<RelatedCaseReasonCode> = new Set([
  "SAME_USERNAME",
  "SAME_SOURCE_IP",
  "SHARED_SYSTEM",
  "SAME_EXTERNAL_ALERT_ID",
]);

export function normalizeCorrelationToken(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeAccessedSystems(
  values: readonly string[] | null | undefined,
): string[] {
  if (!values || values.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const token = normalizeCorrelationToken(raw);
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function systemsOverlap(
  left: readonly string[],
  right: readonly string[],
): string[] {
  if (left.length === 0 || right.length === 0) return [];
  const rightKeys = new Map(
    right.map((item) => [item.toLowerCase(), item] as const),
  );
  const hits: string[] = [];
  for (const item of left) {
    const hit = rightKeys.get(item.toLowerCase());
    if (hit) hits.push(hit);
  }
  return hits;
}

function buildReasons(
  current: CorrelationCaseFacts,
  candidate: CorrelationCaseFacts,
): RelatedCaseReason[] {
  const reasons: RelatedCaseReason[] = [];

  if (
    current.username &&
    candidate.username &&
    current.username.toLowerCase() === candidate.username.toLowerCase()
  ) {
    reasons.push({ code: "SAME_USERNAME", value: current.username });
  }

  if (
    current.sourceIp &&
    candidate.sourceIp &&
    current.sourceIp.toLowerCase() === candidate.sourceIp.toLowerCase()
  ) {
    reasons.push({ code: "SAME_SOURCE_IP", value: current.sourceIp });
  }

  for (const system of systemsOverlap(
    current.accessedSystems,
    candidate.accessedSystems,
  )) {
    reasons.push({ code: "SHARED_SYSTEM", value: system });
  }

  if (
    current.originalAlertId &&
    candidate.originalAlertId &&
    current.originalAlertId === candidate.originalAlertId
  ) {
    reasons.push({
      code: "SAME_EXTERNAL_ALERT_ID",
      value: current.originalAlertId,
    });
  }

  const hasStrong = reasons.some((r) => STRONG_REASON_CODES.has(r.code));
  if (
    hasStrong &&
    current.alertSource &&
    candidate.alertSource &&
    current.alertSource === candidate.alertSource
  ) {
    reasons.push({ code: "SAME_ALERT_SOURCE", value: current.alertSource });
  }

  return reasons;
}

/** 确定性排序权重：多字段 > username/IP > external id > systems > alert source 附加 */
export function rankRelatedCaseScore(reasons: readonly RelatedCaseReason[]): number {
  let score = 0;
  let sharedSystemCount = 0;
  for (const reason of reasons) {
    switch (reason.code) {
      case "SAME_USERNAME":
        score += 100;
        break;
      case "SAME_SOURCE_IP":
        score += 100;
        break;
      case "SAME_EXTERNAL_ALERT_ID":
        score += 80;
        break;
      case "SHARED_SYSTEM":
        sharedSystemCount += 1;
        break;
      case "SAME_ALERT_SOURCE":
        score += 5;
        break;
    }
  }
  if (sharedSystemCount > 0) {
    score += 40 + Math.min(sharedSystemCount - 1, 3) * 5;
  }
  // 多强字段同时命中额外加权
  const strongDistinct = new Set(
    reasons
      .map((r) => r.code)
      .filter((code) => STRONG_REASON_CODES.has(code)),
  );
  if (strongDistinct.size >= 2) {
    score += 50;
  }
  return score;
}

function isEligible(reasons: readonly RelatedCaseReason[]): boolean {
  return reasons.some((r) => STRONG_REASON_CODES.has(r.code));
}

/**
 * 从候选集合中筛选并排序关联案件。
 * 调用方负责排除过旧记录；本函数排除 current、null 互配与 weak-only 关联。
 */
export function findRelatedCases(
  current: CorrelationCaseFacts,
  candidates: readonly CorrelationCaseFacts[],
  options?: { limit?: number },
): RelatedCaseItem[] {
  const limit = options?.limit ?? RELATED_CASES_RESULT_CAP;
  const ranked: Array<RelatedCaseItem & { score: number }> = [];

  for (const candidate of candidates) {
    if (candidate.caseId === current.caseId) continue;
    const reasons = buildReasons(current, candidate);
    if (!isEligible(reasons)) continue;
    ranked.push({
      caseId: candidate.caseId,
      caseNumber: candidate.caseNumber,
      title: candidate.title,
      status: candidate.status,
      suggestedRiskLevel: candidate.suggestedRiskLevel,
      humanRiskLevel: candidate.humanRiskLevel,
      lastActivityAt: candidate.lastActivityAt,
      reasons,
      score: rankRelatedCaseScore(reasons),
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.lastActivityAt !== b.lastActivityAt) {
      return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
    }
    return a.caseNumber.localeCompare(b.caseNumber, "en");
  });

  return ranked.slice(0, limit).map((entry) => ({
    caseId: entry.caseId,
    caseNumber: entry.caseNumber,
    title: entry.title,
    status: entry.status,
    suggestedRiskLevel: entry.suggestedRiskLevel,
    humanRiskLevel: entry.humanRiskLevel,
    lastActivityAt: entry.lastActivityAt,
    reasons: entry.reasons,
  }));
}
