/**
 * HumanReview Semantic Command 输入收口（v1.3 Step 6）。
 *
 * Client 仅可提交 finalConclusion / humanRiskLevel。
 * reviewer / reviewedByUserId 由 Server 根据 AuthUser 写入，不得作为可信输入。
 * conclusionNote 属 Snapshot-owned，不得经 Semantic Command 覆盖。
 */

import type { FinalConclusion, RiskLevel } from "@/domain/types";

const FINAL_CONCLUSIONS = new Set<FinalConclusion>([
  "NORMAL_BUSINESS",
  "SUSPECTED_SECURITY_INCIDENT",
  "INCONCLUSIVE",
]);

const RISK_LEVELS = new Set<RiskLevel>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const SEMANTIC_KEYS = new Set(["finalConclusion", "humanRiskLevel"]);

export type HumanReviewSemanticInput = {
  finalConclusion: FinalConclusion | null;
  humanRiskLevel: RiskLevel | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFinalConclusion(
  value: unknown,
): { ok: true; value: FinalConclusion | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string" && FINAL_CONCLUSIONS.has(value as FinalConclusion)) {
    return { ok: true, value: value as FinalConclusion };
  }
  return { ok: false, error: "finalConclusion 无效" };
}

function parseRiskLevel(
  value: unknown,
): { ok: true; value: RiskLevel | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string" && RISK_LEVELS.has(value as RiskLevel)) {
    return { ok: true, value: value as RiskLevel };
  }
  return { ok: false, error: "humanRiskLevel 无效" };
}

/**
 * 运行时 allowlist：未知 / 责任字段 / Snapshot 字段一律 reject。
 */
export function parseHumanReviewSemanticInput(
  raw: unknown,
): HumanReviewSemanticInput | string {
  if (!isObject(raw)) return "人工研判语义载荷格式无效";

  const bad = Object.keys(raw).filter((key) => !SEMANTIC_KEYS.has(key));
  if (bad.length > 0) {
    return `人工研判语义不允许字段：${bad.join(", ")}`;
  }

  if (!("finalConclusion" in raw) || !("humanRiskLevel" in raw)) {
    return "人工研判语义缺少 finalConclusion 或 humanRiskLevel";
  }

  const conclusion = parseFinalConclusion(raw.finalConclusion);
  if (!conclusion.ok) return conclusion.error;
  const risk = parseRiskLevel(raw.humanRiskLevel);
  if (!risk.ok) return risk.error;

  return {
    finalConclusion: conclusion.value,
    humanRiskLevel: risk.value,
  };
}
