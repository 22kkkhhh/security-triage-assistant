/**
 * Security verification action 的稳定 identity（ruleId + actionIndex）。
 * actionIndex 来自规则 registry 中 verificationActions 数组位置，不是展示 label。
 */
export const SECURITY_EVIDENCE_IDENTITY_GAP =
  "SECURITY_EVIDENCE_IDENTITY_GAP";

export function buildSecurityVerificationSuggestionKey(
  ruleId: string,
  actionIndex: number,
): string {
  return `EVIDENCE:security:${ruleId}:${actionIndex}`;
}

export function buildSecurityEvidenceProgressSourceKey(
  ruleId: string,
  actionIndex: number,
): string {
  return `security:${ruleId}:${actionIndex}`;
}

export function parseSecurityVerificationSuggestionKey(
  suggestionKey: string,
): { ruleId: string; actionIndex: number } | null {
  const match = /^EVIDENCE:security:([^:]+):(\d+)$/.exec(suggestionKey);
  if (!match) return null;
  return {
    ruleId: match[1]!,
    actionIndex: Number.parseInt(match[2]!, 10),
  };
}
