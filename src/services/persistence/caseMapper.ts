import type {
  CaseStatus,
  ChecklistItem,
  FinalConclusion,
  RiskLevel,
  SecurityCaseDraft,
} from "@/domain/types";
import type {
  CaseListItem,
  PersistedCase,
  PersistedCaseState,
} from "./types";

/** Prisma CaseRecord 行（与 schema 对齐的最小形状，避免 Domain 直接依赖 Prisma） */
export interface CaseRecordRow {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  suggestedRiskLevel: string | null;
  humanRiskLevel: string | null;
  humanConclusion: string | null;
  username: string | null;
  sourceIp: string | null;
  systemsSearchText: string | null;
  pendingChecklistCount: number;
  hasReport: boolean;
  reportUpdatedAt: Date | null;
  lastActivityAt: Date;
  caseState: unknown;
  reportDraft: unknown;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export function buildSystemsSearchText(systems: string[]): string | null {
  if (systems.length === 0) return null;
  return systems.join("|");
}

export function countPendingChecklist(checklist: ChecklistItem[]): number {
  return checklist.filter((item) => !item.completed).length;
}

export function toPersistedCaseState(input: {
  name: string;
  createdAt: string;
  alert: SecurityCaseDraft["alert"];
  dataContext: SecurityCaseDraft["dataContext"];
  networkContext: SecurityCaseDraft["networkContext"];
  identityContext: SecurityCaseDraft["identityContext"];
  businessContext: SecurityCaseDraft["businessContext"];
  checklist: ChecklistItem[];
  humanReview: SecurityCaseDraft["humanReview"];
  timeline: SecurityCaseDraft["timeline"];
}): PersistedCaseState {
  return {
    caseData: {
      name: input.name,
      createdAt: input.createdAt,
      alert: input.alert,
      dataContext: input.dataContext,
      networkContext: input.networkContext,
      identityContext: input.identityContext,
    },
    businessContext: input.businessContext,
    checklist: input.checklist,
    humanReview: input.humanReview,
    timeline: input.timeline,
  };
}

/** 从持久化状态还原 SecurityCaseDraft（分析结果需另行重新计算） */
export function toSecurityCaseDraft(
  id: string,
  state: PersistedCaseState,
): SecurityCaseDraft {
  return {
    id,
    name: state.caseData.name,
    createdAt: state.caseData.createdAt,
    alert: state.caseData.alert,
    dataContext: state.caseData.dataContext,
    networkContext: state.caseData.networkContext,
    identityContext: state.caseData.identityContext,
    businessContext: state.businessContext,
    humanReview: state.humanReview,
    timeline: state.timeline,
    report: null,
  };
}

/**
 * 恢复案件时合并 Checklist：
 * - 用户已维护的状态（completed / note / origin / 人工新增 / 删除）为权威；
 * - 新规则产生、尚不存在于已保存清单中的项追加为未完成；
 * - 已保存但不在新规则列表中的 SYSTEM 项保留（避免丢失用户编辑）；
 * - MANUAL 项一律保留。
 */
export function mergeChecklistOnRestore(
  persisted: ChecklistItem[],
  freshlyGenerated: ChecklistItem[],
): ChecklistItem[] {
  const persistedByKey = new Map<string, ChecklistItem>();
  for (const item of persisted) {
    persistedByKey.set(checklistMergeKey(item), item);
  }

  const merged: ChecklistItem[] = [];
  const seen = new Set<string>();

  for (const fresh of freshlyGenerated) {
    const key = checklistMergeKey(fresh);
    const existing = persistedByKey.get(key);
    if (existing) {
      merged.push({
        ...fresh,
        id: existing.id,
        completed: existing.completed,
        note: existing.note,
        origin: existing.origin,
      });
      seen.add(key);
    } else {
      // 检查是否按 label 命中（label 去重场景）
      const byLabel = persisted.find(
        (item) => item.label === fresh.label && !seen.has(checklistMergeKey(item)),
      );
      if (byLabel) {
        merged.push({
          ...fresh,
          id: byLabel.id,
          completed: byLabel.completed,
          note: byLabel.note,
          origin: byLabel.origin,
        });
        seen.add(checklistMergeKey(byLabel));
      } else {
        merged.push(fresh);
      }
    }
  }

  // 保留未匹配的已保存项（含人工新增与用户已编辑的系统项）
  for (const item of persisted) {
    const key = checklistMergeKey(item);
    if (seen.has(key)) continue;
    if (merged.some((m) => m.id === item.id || m.label === item.label)) continue;
    merged.push(item);
  }

  return merged;
}

function checklistMergeKey(item: ChecklistItem): string {
  if (item.relatedRuleId) return `rule:${item.relatedRuleId}:${item.label}`;
  return `id:${item.id}`;
}

export function rowToPersistedCase(row: CaseRecordRow): PersistedCase {
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    title: row.title,
    status: row.status as CaseStatus,
    suggestedRiskLevel: row.suggestedRiskLevel as RiskLevel | null,
    humanRiskLevel: row.humanRiskLevel as RiskLevel | null,
    humanConclusion: row.humanConclusion as FinalConclusion | null,
    username: row.username,
    sourceIp: row.sourceIp,
    systemsSearchText: row.systemsSearchText,
    pendingChecklistCount: row.pendingChecklistCount,
    hasReport: row.hasReport,
    reportUpdatedAt: row.reportUpdatedAt
      ? row.reportUpdatedAt.toISOString()
      : null,
    lastActivityAt: row.lastActivityAt.toISOString(),
    caseState: row.caseState as PersistedCaseState,
    reportDraft: (row.reportDraft as PersistedCase["reportDraft"]) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

export function rowToListItem(row: CaseRecordRow): CaseListItem {
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    title: row.title,
    status: row.status as CaseStatus,
    suggestedRiskLevel: row.suggestedRiskLevel as RiskLevel | null,
    humanRiskLevel: row.humanRiskLevel as RiskLevel | null,
    humanConclusion: row.humanConclusion as FinalConclusion | null,
    username: row.username,
    sourceIp: row.sourceIp,
    systemsSearchText: row.systemsSearchText,
    pendingChecklistCount: row.pendingChecklistCount,
    hasReport: row.hasReport,
    reportUpdatedAt: row.reportUpdatedAt
      ? row.reportUpdatedAt.toISOString()
      : null,
    lastActivityAt: row.lastActivityAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}
