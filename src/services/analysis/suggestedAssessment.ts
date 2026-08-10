import type {
  AnalysisResult,
  BusinessContext,
  DimensionAssessment,
  RiskLevel,
  SecurityDomain,
  SuggestedAssessment,
} from "@/domain/types";
import { securityDomainLabels } from "@/domain/labels";

const riskOrder: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function maxRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (acc, level) =>
      riskOrder.indexOf(level) > riskOrder.indexOf(acc) ? level : acc,
    "LOW",
  );
}

/** 仅聚合 ABNORMAL 的非空 riskLevel；UNKNOWN 的 null 不得参与 LOW 统计 */
function maxAbnormalRisk(results: AnalysisResult[]): RiskLevel {
  const levels = results
    .filter((r) => r.status === "ABNORMAL" && r.riskLevel != null)
    .map((r) => r.riskLevel as RiskLevel);
  return maxRisk(levels);
}

function techAbnormalResults(results: AnalysisResult[]): AnalysisResult[] {
  return results.filter(
    (r) => r.status === "ABNORMAL" && r.category !== "BUSINESS",
  );
}

function abnormalTechDomainLabels(results: AnalysisResult[]): string[] {
  return [
    ...new Set(
      techAbnormalResults(results).map((r) => securityDomainLabels[r.category]),
    ),
  ];
}

/**
 * 单维度汇总：
 * - 任一结果 ABNORMAL → ABNORMAL，取最高风险等级；
 * - 全部 NORMAL → NORMAL；
 * - 其余情况（含 UNKNOWN）→ UNKNOWN，riskLevel 为 null。
 */
function rollupDimension(
  results: AnalysisResult[],
  domain: SecurityDomain,
): DimensionAssessment {
  const rs = results.filter((r) => r.category === domain);
  if (rs.some((r) => r.status === "ABNORMAL")) {
    return {
      status: "ABNORMAL",
      riskLevel: maxAbnormalRisk(rs),
    };
  }
  if (rs.length > 0 && rs.every((r) => r.status === "NORMAL")) {
    return { status: "NORMAL", riskLevel: "LOW" };
  }
  return { status: "UNKNOWN", riskLevel: null };
}

/**
 * 生成系统综合研判建议。
 * AUTHORIZED 表示强业务解释证据，但不自动消除技术异常或无条件降为 LOW。
 */
export function buildSuggestedAssessment(input: {
  results: AnalysisResult[];
  businessContext: BusinessContext;
}): SuggestedAssessment {
  const { results, businessContext } = input;

  const data = rollupDimension(results, "DATA");
  const network = rollupDimension(results, "NETWORK");
  const identity = rollupDimension(results, "IDENTITY");
  const businessLegitimacy = businessContext.businessLegitimacy;

  const unknownCount = results.filter((r) => r.status === "UNKNOWN").length;
  const evidenceConfidence: SuggestedAssessment["evidenceConfidence"] =
    results.length === 0
      ? "LOW"
      : unknownCount === 0
        ? "HIGH"
        : unknownCount <= results.length / 3
          ? "MEDIUM"
          : "LOW";

  const techAbnormal = techAbnormalResults(results);
  const abnormalDomains = abnormalTechDomainLabels(results);
  const maxTechRisk = maxAbnormalRisk(techAbnormal);
  const businessPhrase =
    businessLegitimacy === "UNKNOWN"
      ? "，业务合理性尚未确认"
      : businessLegitimacy === "UNAUTHORIZED"
        ? "，且业务合理性确认未获授权"
        : "";
  const hasUnknownDimension =
    data.status === "UNKNOWN" ||
    network.status === "UNKNOWN" ||
    identity.status === "UNKNOWN" ||
    businessLegitimacy === "UNKNOWN";

  let suggestedRiskLevel: RiskLevel | null;
  let summary: string;

  if (businessLegitimacy === "AUTHORIZED") {
    if (techAbnormal.length === 0) {
      suggestedRiskLevel = "LOW";
      summary =
        "当前未见明显技术异常，业务上下文已确认为授权行为。最终结论以人工研判为准。";
    } else if (abnormalDomains.length >= 2) {
      suggestedRiskLevel =
        maxTechRisk === "CRITICAL" || maxTechRisk === "HIGH" ? "MEDIUM" : "LOW";
      summary = `当前证据显示，${abnormalDomains.join("、")}多个维度存在技术异常，虽存在授权业务解释，但仍需核实技术风险并保留核查记录。最终结论以人工研判为准。`;
    } else if (maxTechRisk === "HIGH" || maxTechRisk === "CRITICAL") {
      suggestedRiskLevel = "MEDIUM";
      summary = `当前证据显示，${abnormalDomains[0]}维度存在较高技术异常，虽业务上下文已确认授权，但仍需核实技术风险。最终结论以人工研判为准。`;
    } else if (maxTechRisk === "MEDIUM") {
      suggestedRiskLevel = "LOW";
      summary = `当前证据显示，${abnormalDomains[0]}维度存在技术异常，但业务上下文已确认该行为获得授权，系统建议降低调查优先级并保留核查记录。最终结论以人工研判为准。`;
    } else {
      suggestedRiskLevel = "LOW";
      summary = `当前证据显示存在轻微技术异常，业务上下文已确认授权，系统建议按授权业务行为处理并保留核查记录。最终结论以人工研判为准。`;
    }
  } else if (businessLegitimacy === "UNAUTHORIZED") {
    suggestedRiskLevel = maxAbnormalRisk(results);
    if (abnormalDomains.length >= 2) {
      summary = `当前证据显示，${abnormalDomains.join("、")}多个维度存在异常，且业务合理性确认未获授权，疑似存在安全风险，建议升级进一步安全调查。该系统建议不构成最终结论，需人工确认。`;
    } else if (abnormalDomains.length === 1) {
      summary = `当前证据显示，${abnormalDomains[0]}维度存在异常，且业务合理性确认未获授权，建议进一步核查。该系统建议不构成最终结论，需人工确认。`;
    } else {
      summary =
        "业务合理性确认未获授权，建议进一步核查操作背景。该系统建议不构成最终结论，需人工确认。";
    }
  } else if (abnormalDomains.length >= 2) {
    suggestedRiskLevel = maxAbnormalRisk(techAbnormal);
    summary = `当前证据显示，${abnormalDomains.join("、")}多个维度同时存在异常${businessPhrase}，疑似存在安全风险，建议升级进一步安全调查。该系统建议不构成最终结论，需人工确认。`;
  } else if (abnormalDomains.length === 1) {
    suggestedRiskLevel = maxAbnormalRisk(techAbnormal);
    summary = `当前证据显示，${abnormalDomains[0]}维度存在异常${businessPhrase}，建议进一步核查。该系统建议不构成最终结论，需人工确认。`;
  } else if (hasUnknownDimension) {
    suggestedRiskLevel = null;
    summary =
      "当前缺少必要数据，暂无法形成有效研判建议，建议先按核查清单补充数据。";
  } else {
    suggestedRiskLevel = "LOW";
    summary = "当前未见明显异常。最终结论以人工研判为准。";
  }

  const recommendedNextActions = [
    ...new Set(
      results
        .filter((r) => r.status !== "NORMAL")
        .flatMap((r) => r.verificationActions.map((a) => a.label)),
    ),
  ];

  return {
    data,
    network,
    identity,
    businessLegitimacy,
    evidenceConfidence,
    suggestedRiskLevel,
    summary,
    recommendedNextActions,
  };
}
