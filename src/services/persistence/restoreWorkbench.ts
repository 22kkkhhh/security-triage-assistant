import type {
  CaseStatus,
  ChecklistItem,
  RiskLevel,
  SecurityCase,
  SecurityCaseDraft,
  TimelineEvent,
} from "@/domain/types";
import { analyzePersistedCase } from "@/services/analysis/analyzePersistedCase";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  mergeChecklistOnRestore,
  toSecurityCaseDraft,
} from "./caseMapper";
import type { CaseOwnership } from "@/domain/caseOwnership";
import { emptyCaseOwnership } from "@/domain/caseOwnership";
import type { PersistedCase, PersistedCaseState } from "./types";

/** 恢复到 Workbench 的初始视图（分析结果为现场派生） */
export interface RestoredWorkbenchView {
  caseId: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  updatedAt: string;
  /** 运营负责人（与 HumanReview reviewer 分离） */
  ownership: CaseOwnership;
  /** 运营截止时间 ISO；null = 未设置 */
  dueAt: string | null;
  /** 含持久化 businessContext / humanReview / timeline */
  draft: SecurityCaseDraft;
  /** 已与当前规则合并后的 checklist */
  initialChecklist: ChecklistItem[];
  /** 当前业务上下文下重新分析得到的建议风险（非持久化权威） */
  suggestedRiskLevel: RiskLevel | null;
}

/**
 * 从 PersistedCase 构建 Workbench 初始数据：
 * caseState → draft → analyzeSecurityCase → mergeChecklistOnRestore。
 * 不持久化、不返回 AnalysisResult 作为第二套状态。
 */
export function restoreWorkbenchFromPersisted(
  record: PersistedCase,
): RestoredWorkbenchView {
  const { draft, analyzed } = analyzePersistedCase(record);
  return restoreWorkbenchFromAnalyzed(record, draft, analyzed);
}

export function restoreWorkbenchFromAnalyzed(
  record: PersistedCase,
  draft: SecurityCaseDraft,
  analyzed: SecurityCase,
): RestoredWorkbenchView {
  return restoreWorkbenchFromState({
    caseId: record.id,
    caseNumber: record.caseNumber,
    status: record.status,
    updatedAt: record.updatedAt,
    ownership: record.ownership,
    dueAt: record.dueAt,
    caseState: record.caseState,
    draft,
    analyzed,
  });
}

export function restoreWorkbenchFromState(input: {
  caseId: string;
  caseNumber: string;
  status: CaseStatus;
  updatedAt: string;
  ownership?: CaseOwnership;
  dueAt?: string | null;
  caseState: PersistedCaseState;
  /** 已计算的分析结果；省略时现场 analyze 一次。 */
  draft?: SecurityCaseDraft;
  analyzed?: SecurityCase;
}): RestoredWorkbenchView {
  const draft =
    input.draft ?? toSecurityCaseDraft(input.caseId, input.caseState);
  const analyzed = input.analyzed ?? analyzeSecurityCase(draft);
  const initialChecklist = mergeChecklistOnRestore(
    input.caseState.checklist,
    analyzed.checklist,
  );

  return {
    caseId: input.caseId,
    caseNumber: input.caseNumber,
    title: draft.name,
    status: input.status,
    updatedAt: input.updatedAt,
    ownership: input.ownership ?? emptyCaseOwnership(),
    dueAt: input.dueAt ?? null,
    draft,
    initialChecklist,
    suggestedRiskLevel:
      analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  };
}

/**
 * Timeline 去重：按稳定 id 合并，已持久化事件优先，避免重跑分析时重复系统事件。
 * 当前 analyzeSecurityCase 不重写 timeline，此函数用于防御性合并。
 */
export function mergeTimelineOnRestore(
  persisted: TimelineEvent[],
  incoming: TimelineEvent[],
): TimelineEvent[] {
  const byId = new Map<string, TimelineEvent>();
  for (const event of incoming) {
    byId.set(event.id, event);
  }
  for (const event of persisted) {
    byId.set(event.id, event);
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
}
