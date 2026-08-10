/**
 * v1.5 Workstream 1：Case Investigation Context → Compliance Runtime Refresh。
 *
 * 只读 server contract：基于当前持久化 Case 状态重新 resolve 合规面板/建议清单视图。
 * 不修改 Case 持久化状态；不修改 Report frozen complianceReferences。
 */
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import type { VersionSelectionBasis } from "@/domain/knowledge";
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
import {
  resolveCaseCompliance,
  resolveCaseComplianceFromGraph,
  type KnowledgeResolutionGraph,
  type ResolveCaseComplianceResult,
} from "@/services/knowledge/resolveCaseCompliance";
import { toSecurityCaseDraft } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";

export type CaseComplianceWorkbenchViews = {
  panel: CaseCompliancePanelView;
  checklist: CaseComplianceChecklistView;
};

export type RefreshCaseComplianceRuntimeOptions = {
  /** 固定 Snapshot capturedAt；默认 record.updatedAt */
  capturedAt?: string;
  now?: Date | string;
  topN?: number;
};

export type CaseComplianceRuntimeMeta = {
  capturedAt: string;
  caseDate: string | null;
  versionSelectionBasis: VersionSelectionBasis;
  hitRuleIds: string[];
  skippedUnknownRuleIds: string[];
};

export type ComplianceRuntimeResolutionStatus =
  | "SUCCESS"
  | "RESOLUTION_UNAVAILABLE";

export type RefreshCaseComplianceRuntimeResult = {
  /** SUCCESS = 正常 resolve；RESOLUTION_UNAVAILABLE = resolver 失败，非「零 findings」 */
  resolutionStatus: ComplianceRuntimeResolutionStatus;
  views: CaseComplianceWorkbenchViews;
  meta: CaseComplianceRuntimeMeta;
  /** resolver 失败时的可读原因（不含 secrets） */
  resolutionError?: string;
};

export function emptyCaseComplianceWorkbenchViews(): CaseComplianceWorkbenchViews {
  return {
    panel: emptyCaseCompliancePanelView(),
    checklist: emptyCaseComplianceChecklistView(),
  };
}

/** 与 Case 版本绑定的 deterministic capturedAt（同一 updatedAt → 同一 Snapshot 时间戳） */
export function deriveRuntimeCapturedAt(record: PersistedCase): string {
  return record.updatedAt;
}

export function buildComplianceWorkbenchViewsFromResolved(
  resolved: ResolveCaseComplianceResult,
): CaseComplianceWorkbenchViews {
  return {
    panel: buildCaseCompliancePanelView(
      resolved.snapshots,
      resolved.findings,
    ),
    checklist: buildCaseComplianceChecklistView(resolved.allFindings),
  };
}

function emptyRuntimeMeta(capturedAt: string): CaseComplianceRuntimeMeta {
  return {
    capturedAt,
    caseDate: null,
    versionSelectionBasis: "CURRENT_DATE",
    hitRuleIds: [],
    skippedUnknownRuleIds: [],
  };
}

function toRuntimeResult(
  resolved: ResolveCaseComplianceResult,
  capturedAt: string,
): RefreshCaseComplianceRuntimeResult {
  return {
    resolutionStatus: "SUCCESS",
    views: buildComplianceWorkbenchViewsFromResolved(resolved),
    meta: {
      capturedAt,
      caseDate: resolved.caseDate,
      versionSelectionBasis: resolved.versionSelectionBasis,
      hitRuleIds: resolved.hitRuleIds,
      skippedUnknownRuleIds: resolved.skippedUnknownRuleIds,
    },
  };
}

function unavailableRuntimeResult(
  capturedAt: string,
  error: unknown,
): RefreshCaseComplianceRuntimeResult {
  const message =
    error instanceof Error ? error.message : "Compliance runtime unavailable";
  return {
    resolutionStatus: "RESOLUTION_UNAVAILABLE",
    views: emptyCaseComplianceWorkbenchViews(),
    meta: emptyRuntimeMeta(capturedAt),
    resolutionError: message,
  };
}

/**
 * 纯函数 refresh（测试 / 离线 graph）；与 DB 路径共享同一视图构建逻辑。
 */
export function refreshCaseComplianceRuntimeFromGraph(
  record: PersistedCase,
  graph: KnowledgeResolutionGraph,
  options?: RefreshCaseComplianceRuntimeOptions,
): RefreshCaseComplianceRuntimeResult {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  const capturedAt =
    options?.capturedAt ?? deriveRuntimeCapturedAt(record);

  try {
    const resolved = resolveCaseComplianceFromGraph(
      {
        draft,
        analysisResults: analyzed.analysisResults,
        evidences: analyzed.evidences,
        topN: options?.topN ?? CASE_UI_COMPLIANCE_TOP_N,
        capturedAt,
        now: options?.now,
      },
      graph,
    );
    return toRuntimeResult(resolved, capturedAt);
  } catch (error) {
    return unavailableRuntimeResult(capturedAt, error);
  }
}

/**
 * Case context 更新后刷新 Compliance Runtime 视图（server-side contract）。
 * 复用 resolveCaseCompliance / selectTopFindingsByRelevance / load 视图构建链。
 */
export async function refreshCaseComplianceRuntimeViews(
  record: PersistedCase,
  options?: RefreshCaseComplianceRuntimeOptions,
): Promise<RefreshCaseComplianceRuntimeResult> {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  const capturedAt =
    options?.capturedAt ?? deriveRuntimeCapturedAt(record);

  try {
    const resolved = await resolveCaseCompliance({
      draft,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      topN: options?.topN ?? CASE_UI_COMPLIANCE_TOP_N,
      capturedAt,
      now: options?.now,
    });
    return toRuntimeResult(resolved, capturedAt);
  } catch (error) {
    return unavailableRuntimeResult(capturedAt, error);
  }
}
