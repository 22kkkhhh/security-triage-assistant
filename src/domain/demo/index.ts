import type { SecurityCaseDraft } from "../types";
import { caseA } from "./caseA";
import { caseB } from "./caseB";

export { caseA, caseB };

/**
 * 演示用 Mock 案件草稿，全部为虚构数据。
 * 分析结果由规则引擎生成：analyzeSecurityCase(draft)。
 */
export const demoCaseDrafts: SecurityCaseDraft[] = [caseA, caseB];
