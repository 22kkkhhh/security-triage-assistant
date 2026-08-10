/**
 * Case 详情页 Server runtime：一次 resolve 产出合规视图 + Investigation Progress DTO。
 * 勿从 Client Component 引用本模块。
 */
import type { InvestigationProgressSummary } from "@/domain/investigationProgress";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  CASE_UI_COMPLIANCE_TOP_N,
} from "@/services/knowledge/caseCompliancePanel";
import {
  buildComplianceWorkbenchViewsFromResolved,
  deriveRuntimeCapturedAt,
  emptyCaseComplianceWorkbenchViews,
  type CaseComplianceWorkbenchViews,
} from "@/services/knowledge/loadCaseCompliancePanel";
import { resolveCaseCompliance } from "@/services/knowledge/resolveCaseCompliance";
import { loadInvestigationProgress } from "@/services/knowledge/resolveInvestigationProgress";
import { toSecurityCaseDraft } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";

/** 可序列化、供 Client 只读展示的 Progress DTO（SoT 来自 Hermes projection） */
export type InvestigationProgressViewDto =
  | {
      resolutionStatus: "SUCCESS";
      summary: InvestigationProgressSummary;
    }
  | {
      /** 运行时 resolver 不可用；绝不能伪装为全 0 的成功进度。 */
      resolutionStatus: "RESOLUTION_UNAVAILABLE";
    };

export type CaseWorkbenchRuntimeViews = {
  compliance: CaseComplianceWorkbenchViews;
  investigationProgress: InvestigationProgressViewDto;
};

function unavailableInvestigationProgressViewDto(): InvestigationProgressViewDto {
  return {
    resolutionStatus: "RESOLUTION_UNAVAILABLE",
  };
}

function toProgressDto(
  summary: InvestigationProgressSummary,
): InvestigationProgressViewDto {
  return { resolutionStatus: "SUCCESS", summary: { ...summary } };
}

/**
 * Persisted Case → analyze → compliance findings → loadInvestigationProgress。
 * 与 M1 compliance loader 同一次 server 路径；Client 不二次 fetch。
 */
export async function loadCaseWorkbenchRuntimeViews(
  record: PersistedCase,
): Promise<CaseWorkbenchRuntimeViews> {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  const capturedAt = deriveRuntimeCapturedAt(record);

  try {
    const resolved = await resolveCaseCompliance({
      draft,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      topN: CASE_UI_COMPLIANCE_TOP_N,
      capturedAt,
    });
    const compliance = buildComplianceWorkbenchViewsFromResolved(resolved);
    const progress = loadInvestigationProgress(analyzed, {
      complianceFindings: resolved.allFindings,
    });
    return {
      compliance,
      investigationProgress: toProgressDto(progress.summary),
    };
  } catch {
    return {
      compliance: emptyCaseComplianceWorkbenchViews(),
      investigationProgress: unavailableInvestigationProgressViewDto(),
    };
  }
}
