/**
 * 从 PersistedCase 提取关联事实：优先索引列，再回退 caseState。
 */

import type { PersistedCase } from "@/services/persistence/types";
import {
  normalizeAccessedSystems,
  normalizeCorrelationToken,
} from "./findRelatedCases";
import type { CorrelationCaseFacts } from "./types";

function systemsFromSearchText(text: string | null): string[] {
  if (!text) return [];
  return normalizeAccessedSystems(text.split("|"));
}

export function extractCorrelationFacts(
  record: PersistedCase,
): CorrelationCaseFacts {
  const identity = record.caseState.caseData.identityContext;
  const alert = record.caseState.caseData.alert;

  const username =
    normalizeCorrelationToken(record.username) ??
    normalizeCorrelationToken(identity.accountName);

  const sourceIp =
    normalizeCorrelationToken(record.sourceIp) ??
    normalizeCorrelationToken(identity.loginSourceIp);

  const accessedSystems = normalizeAccessedSystems(
    identity.accessedSystems.length > 0
      ? identity.accessedSystems
      : systemsFromSearchText(record.systemsSearchText),
  );

  return {
    caseId: record.id,
    caseNumber: record.caseNumber,
    title: record.title,
    status: record.status,
    suggestedRiskLevel: record.suggestedRiskLevel,
    humanRiskLevel: record.humanRiskLevel,
    lastActivityAt: record.lastActivityAt,
    username,
    sourceIp,
    accessedSystems,
    alertSource: normalizeCorrelationToken(alert.source),
    originalAlertId: normalizeCorrelationToken(alert.originalAlertId),
  };
}
