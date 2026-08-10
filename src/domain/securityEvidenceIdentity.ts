/**
 * Security verification action 的稳定 identity（ruleId + actionId）。
 * actionId 来自规则 registry 显式定义，不依赖数组位置或展示 label。
 */

/** M3D index-based provenance 无法安全映射到新 actionId，legacy checklist 保持 fail-closed OPEN。 */
export const LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE =
  "LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE";

/**
 * @deprecated 使用 LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE。
 * 保留别名以兼容现有 import；新代码不应依赖此全局 gap 常量。
 */
export const SECURITY_EVIDENCE_IDENTITY_GAP =
  LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE;

export function buildSecurityVerificationSuggestionKey(
  ruleId: string,
  actionId: string,
): string {
  return `EVIDENCE:security:${ruleId}:${actionId}`;
}

export function buildSecurityEvidenceProgressSourceKey(
  ruleId: string,
  actionId: string,
): string {
  return `security:${ruleId}:${actionId}`;
}

export function isLegacyIndexSecurityProvenance(
  suggestionKey: string,
): boolean {
  return /^EVIDENCE:security:[^:]+:\d+$/.test(suggestionKey);
}

export function parseSecurityVerificationSuggestionKey(
  suggestionKey: string,
): { ruleId: string; actionId: string } | null {
  if (isLegacyIndexSecurityProvenance(suggestionKey)) {
    return null;
  }
  const match = /^EVIDENCE:security:([^:]+):([^:]+)$/.exec(suggestionKey);
  if (!match) return null;
  return {
    ruleId: match[1]!,
    actionId: match[2]!,
  };
}
