/**
 * Case 详情页：服务端一次 resolve，产出合规参考面板 + 建议核查清单。
 * 勿从 Client Component 引用本模块。
 */
import {
  refreshCaseComplianceRuntimeViews,
  type CaseComplianceWorkbenchViews,
} from "@/services/knowledge/refreshCaseComplianceRuntime";
import type { CaseCompliancePanelView } from "@/services/knowledge/caseCompliancePanel";
import type { PersistedCase } from "@/services/persistence/types";

export type {
  CaseComplianceWorkbenchViews,
  RefreshCaseComplianceRuntimeOptions,
  RefreshCaseComplianceRuntimeResult,
} from "@/services/knowledge/refreshCaseComplianceRuntime";

export {
  buildComplianceWorkbenchViewsFromResolved,
  deriveRuntimeCapturedAt,
  emptyCaseComplianceWorkbenchViews,
  refreshCaseComplianceRuntimeFromGraph,
  refreshCaseComplianceRuntimeViews,
} from "@/services/knowledge/refreshCaseComplianceRuntime";

export type LoadCaseComplianceWorkbenchOptions = {
  capturedAt?: string;
  now?: Date | string;
  topN?: number;
};

/**
 * 服务端解析一次（topN 走 selectTopFindingsByRelevance），
 * 同时构建参考面板与建议核查清单；失败时双空视图。
 */
export async function loadCaseComplianceWorkbenchViews(
  record: PersistedCase,
  options?: LoadCaseComplianceWorkbenchOptions,
): Promise<CaseComplianceWorkbenchViews> {
  const result = await refreshCaseComplianceRuntimeViews(record, options);
  return result.views;
}

/** @deprecated 使用 loadCaseComplianceWorkbenchViews */
export async function loadCaseCompliancePanelView(
  record: PersistedCase,
): Promise<CaseCompliancePanelView> {
  const views = await loadCaseComplianceWorkbenchViews(record);
  return views.panel;
}
