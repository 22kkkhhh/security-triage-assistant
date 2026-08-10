/**
 * v1.7 产品内部 Wazuh rule.level → RiskLevel 确定性映射策略。
 * 非 Wazuh 官方 RiskLevel 等价标准。
 */

import type { RiskLevel } from "@/domain/types";

export type WazuhSeverityMapResult =
  | { ok: true; riskLevel: RiskLevel }
  | { ok: false; reason: string };

/**
 * Wazuh rule.level（0–15）→ 产品 RiskLevel。
 * 非数字 / 非整数 / 越界：返回失败原因；不抛错。
 */
export function mapWazuhRuleLevelToRiskLevel(
  raw: string,
): WazuhSeverityMapResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "Wazuh rule.level 为空，原始告警级别保持为空" };
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return {
      ok: false,
      reason: `Wazuh rule.level「${raw}」不是整数，原始告警级别保持为空`,
    };
  }

  const level = Number(trimmed);
  if (!Number.isInteger(level) || level < 0 || level > 15) {
    return {
      ok: false,
      reason: `Wazuh rule.level「${raw}」超出 0–15，原始告警级别保持为空`,
    };
  }

  if (level <= 3) return { ok: true, riskLevel: "LOW" };
  if (level <= 7) return { ok: true, riskLevel: "MEDIUM" };
  if (level <= 11) return { ok: true, riskLevel: "HIGH" };
  return { ok: true, riskLevel: "CRITICAL" };
}
