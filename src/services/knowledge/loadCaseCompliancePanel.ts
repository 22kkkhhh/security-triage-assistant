/**
 * Case 详情页：服务端一次 resolve，产出合规参考面板 + 建议核查清单。
 * 勿从 Client Component 引用本模块。
 */
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  buildCaseComplianceChecklistView,
  emptyCaseComplianceChecklistView,
  type CaseComplianceChecklistView,
} from "@/services/knowledge/caseComplianceChecklist";
import {
  CASE_UI_COMPLIANCE_TOP_N,
  buildCaseCompliancePanelView,
  emptyCaseCompliancePanelView,
  type CaseCompliancePanelView,
} from "@/services/knowledge/caseCompliancePanel";
import { resolveCaseCompliance } from "@/services/knowledge/resolveCaseCompliance";
import { toSecurityCaseDraft } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";

export type CaseComplianceWorkbenchViews = {
  panel: CaseCompliancePanelView;
  checklist: CaseComplianceChecklistView;
};

export function emptyCaseComplianceWorkbenchViews(): CaseComplianceWorkbenchViews {
  return {
    panel: emptyCaseCompliancePanelView(),
    checklist: emptyCaseComplianceChecklistView(),
  };
}

/**
 * 服务端解析一次（topN 走 selectTopFindingsByRelevance），
 * 同时构建参考面板与建议核查清单；失败时双空视图。
 */
export async function loadCaseComplianceWorkbenchViews(
  record: PersistedCase,
): Promise<CaseComplianceWorkbenchViews> {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  try {
    const resolved = await resolveCaseCompliance({
      draft,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      topN: CASE_UI_COMPLIANCE_TOP_N,
    });
    return {
      panel: buildCaseCompliancePanelView(
        resolved.snapshots,
        resolved.findings,
      ),
      // 核查清单聚合截断前全量 findings，避免面板 Top-N 裁掉 IAM/IR 建议
      checklist: buildCaseComplianceChecklistView(resolved.allFindings),
    };
  } catch {
    return emptyCaseComplianceWorkbenchViews();
  }
}

/** @deprecated 使用 loadCaseComplianceWorkbenchViews */
export async function loadCaseCompliancePanelView(
  record: PersistedCase,
): Promise<CaseCompliancePanelView> {
  const views = await loadCaseComplianceWorkbenchViews(record);
  return views.panel;
}
