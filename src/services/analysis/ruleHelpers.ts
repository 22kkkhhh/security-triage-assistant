import type { RuleEvaluation } from "./types";
import type { VerificationAction } from "./verificationActions";

/**
 * UNKNOWN 规则结果工厂：不可评级，riskLevel 必须为 null。
 * 禁止使用 LOW 伪装“缺数据”。
 */
export function unknownEvaluation(
  explanation: string,
  verificationActions: VerificationAction[],
): RuleEvaluation {
  return {
    status: "UNKNOWN",
    riskLevel: null,
    explanation,
    verificationActions,
    evidences: [],
  };
}
