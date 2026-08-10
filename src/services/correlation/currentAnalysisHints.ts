/**
 * 从当前 analyze 结果提取轻量 hints，仅用于 Lead 排序提示。
 * 不创建 AnalysisResult，不改 risk / SuggestedAssessment。
 */

import type { AnalysisResult } from "@/domain/types";
import type { CurrentAnalysisHints } from "./investigationIntelligenceTypes";

export function toCurrentAnalysisHints(
  analysisResults: readonly AnalysisResult[],
): CurrentAnalysisHints {
  let hasIdentityAbnormal = false;
  let hasNetworkAbnormal = false;
  let hasDataAbnormal = false;

  for (const result of analysisResults) {
    if (result.status !== "ABNORMAL") continue;
    if (result.category === "IDENTITY") hasIdentityAbnormal = true;
    if (result.category === "NETWORK") hasNetworkAbnormal = true;
    if (result.category === "DATA") hasDataAbnormal = true;
  }

  return {
    hasIdentityAbnormal,
    hasNetworkAbnormal,
    hasDataAbnormal,
  };
}
