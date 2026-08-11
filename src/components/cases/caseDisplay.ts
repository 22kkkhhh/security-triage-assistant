import { caseStatusLabels, riskLevelLabels } from "@/domain/labels";
import type { CaseStatus, RiskLevel } from "@/domain/types";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";

/** 列表风险显示：优先人工风险，否则建议风险；都没有则“暂无法评级” */
export function displayCaseListRisk(
  humanRiskLevel: RiskLevel | null,
  suggestedRiskLevel: RiskLevel | null,
): string {
  const level = humanRiskLevel ?? suggestedRiskLevel;
  if (!level) return "暂无法评级";
  return riskLevelLabels[level];
}

/** Case List 风险来源（仅 presentation；不改变 risk semantics） */
export type CaseListRiskSource = "HUMAN" | "SUGGESTED" | "UNAVAILABLE";

export type CaseListRiskDisplay = {
  source: CaseListRiskSource;
  /** 实际风险等级文案，供 riskBadgeClass 使用 */
  riskLabel: string;
  /** 带来源前缀的展示文案 */
  text: string;
};

/**
 * Case List 风险展示：明确区分人工风险 / 系统建议。
 * 优先级仍为 humanRiskLevel → suggestedRiskLevel → 暂无法评级。
 */
export function resolveCaseListRiskDisplay(
  humanRiskLevel: RiskLevel | null,
  suggestedRiskLevel: RiskLevel | null,
): CaseListRiskDisplay {
  if (humanRiskLevel) {
    const riskLabel = riskLevelLabels[humanRiskLevel];
    return {
      source: "HUMAN",
      riskLabel,
      text: `人工 · ${riskLabel}`,
    };
  }
  if (suggestedRiskLevel) {
    const riskLabel = riskLevelLabels[suggestedRiskLevel];
    return {
      source: "SUGGESTED",
      riskLabel,
      text: `系统建议 · ${riskLabel}`,
    };
  }
  return {
    source: "UNAVAILABLE",
    riskLabel: "暂无法评级",
    text: "暂无法评级",
  };
}

export function displayCaseStatus(status: CaseStatus): string {
  return caseStatusLabels[status];
}

/** systemsSearchText：HR 系统|ERP 系统|CRM_PROD → HR 系统 / ERP 系统 / CRM_PROD */
export function displaySystems(systemsSearchText: string | null): string {
  if (!systemsSearchText) return "—";
  return systemsSearchText.split("|").filter(Boolean).join(" / ");
}

/** UTC+8 最近更新时间展示：YYYY-MM-DD HH:mm:ss（Web 展示层） */
export function displayUpdatedAt(iso: string): string {
  return formatDateTimeForDisplay(iso);
}

export function riskBadgeClass(label: string): string {
  if (label === "暂无法评级") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  if (label === "严重" || label === "高风险") {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (label === "中风险") {
    return "border-orange-300 bg-orange-50 text-orange-700";
  }
  if (label === "低风险") {
    return "border-green-300 bg-green-50 text-green-700";
  }
  return "border-neutral-300 bg-neutral-50 text-neutral-600";
}

export function statusBadgeClass(status: CaseStatus): string {
  switch (status) {
    case "CLOSED":
      return "border-neutral-300 bg-neutral-100 text-neutral-700";
    case "RESPONDING":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "PENDING_BUSINESS_CONFIRMATION":
    case "PENDING_VERIFICATION":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "INVESTIGATING":
      return "border-sky-300 bg-sky-50 text-sky-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}
