import type { SecurityCase, SecurityCaseDraft } from "@/domain/types";
import { toSecurityCaseDraft } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";
import { analyzeSecurityCase } from "./analyzeSecurityCase";

/** 同一 PersistedCase 上 draft + 完整安全分析的一次性结果。 */
export type AnalyzedPersistedCase = {
  draft: SecurityCaseDraft;
  analyzed: SecurityCase;
};

/**
 * 从持久化 Case 构建 draft 并执行一次完整 analyze。
 * 供同一条 server/client 逻辑链复用，避免对相同 state 重复 analyze。
 */
export function analyzePersistedCase(
  record: PersistedCase,
): AnalyzedPersistedCase {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  return { draft, analyzed };
}
