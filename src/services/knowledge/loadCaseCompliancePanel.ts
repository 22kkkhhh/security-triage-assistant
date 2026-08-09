/**
 * Case 详情页：服务端加载合规参考面板（唯一允许调用 resolveCaseCompliance 的入口）。
 * 勿从 Client Component 引用本模块。
 */
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  CASE_UI_COMPLIANCE_TOP_N,
  buildCaseCompliancePanelView,
  emptyCaseCompliancePanelView,
  type CaseCompliancePanelView,
} from "@/services/knowledge/caseCompliancePanel";
import { resolveCaseCompliance } from "@/services/knowledge/resolveCaseCompliance";
import { toSecurityCaseDraft } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";

/**
 * 服务端解析一次（topN 走 selectTopFindingsByRelevance），失败时返回空视图。
 */
export async function loadCaseCompliancePanelView(
  record: PersistedCase,
): Promise<CaseCompliancePanelView> {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  try {
    const resolved = await resolveCaseCompliance({
      draft,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      topN: CASE_UI_COMPLIANCE_TOP_N,
    });
    return buildCaseCompliancePanelView(resolved.snapshots, resolved.findings);
  } catch {
    return emptyCaseCompliancePanelView();
  }
}
