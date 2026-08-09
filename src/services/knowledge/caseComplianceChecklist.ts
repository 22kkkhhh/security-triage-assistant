/**
 * v1.4 Step 5：Case UI「建议核查事项」纯视图。
 * 仅聚合 Step 2B CaseComplianceFinding 的 missingContext /
 * suggestedEvidence / suggestedChecklist；不推导新的法规义务。
 */
import type {
  CaseComplianceFinding,
  CaseComplianceRelevance,
  ControlClauseRelation,
} from "@/domain/knowledge";

/** Case UI 核查清单 Top-N（5～8） */
export const CASE_UI_COMPLIANCE_CHECKLIST_TOP_N = 8;

export const CASE_COMPLIANCE_CHECKLIST_DISCLAIMER =
  "以下为基于当前合规关联结果的建议核查事项，用于辅助收集上下文与证据；不构成违法认定、合规结论或法律意见。";

export const FORBIDDEN_CASE_COMPLIANCE_CHECKLIST_PHRASES =
  /必须认定违法|已违反|责任成立|已构成违规|已违法|已违规|法律责任成立|合规结论：不合规/;

export type CaseComplianceChecklistKind =
  | "CONTEXT"
  | "EVIDENCE"
  | "CHECKLIST";

export type CaseComplianceChecklistItem = {
  /** 稳定去重键：`${kind}:${sourceKey}` */
  key: string;
  sourceKey: string;
  label: string;
  description?: string;
  kind: CaseComplianceChecklistKind;
  /** 数值越小优先级越高 */
  priority: number;
  controlCodes: string[];
  clauseRefs: Array<{
    clauseKey: string;
    documentCanonicalCode: string;
  }>;
  relevance: CaseComplianceRelevance;
  relationTypes: ControlClauseRelation[];
  ruleIds: string[];
  supportingRuleIds: string[];
  evidenceIds: string[];
};

export type CaseComplianceChecklistGroup = {
  kind: CaseComplianceChecklistKind;
  title: string;
  items: CaseComplianceChecklistItem[];
};

export type CaseComplianceChecklistView = {
  groups: CaseComplianceChecklistGroup[];
  totalCount: number;
  empty: boolean;
};

const KIND_ORDER: readonly CaseComplianceChecklistKind[] = [
  "CONTEXT",
  "EVIDENCE",
  "CHECKLIST",
];

const RELEVANCE_STRENGTH: Record<CaseComplianceRelevance, number> = {
  DIRECT: 0,
  RELEVANT: 1,
  POSSIBLE: 2,
  INSUFFICIENT_CONTEXT: 3,
};

/** 已知 context key → 简洁核查动作文案（展示层，不改 pack） */
const CONTEXT_ACTION_LABELS: Record<string, string> = {
  changeTicketId: "核实该操作是否存在有效授权工单",
  businessOwnerConfirmed: "确认业务负责人是否已核实授权合理性",
  businessJustification: "确认该操作的业务用途与合理性说明",
  destinationRegion: "核实导出数据类型及数据去向",
  dataCategory: "确认涉及的数据类型与敏感字段类别",
  accessedRecordCount: "核实实际访问/导出的数据量级",
  outboundVolume: "核实异常出站流量规模与时间窗口",
  loginSourceIp: "确认登录来源 IP 与非常用访问线索",
  accountName: "确认实际使用人及账号归属",
  occurredAt: "确认告警/操作发生的时间窗口",
  plannedTaskStatus: "核实是否存在经确认的计划任务",
  externalDestination: "核实外部目的地址或传输去向",
};

/** 已知 evidence key → 简洁收集动作 */
const EVIDENCE_ACTION_LABELS: Record<string, string> = {
  "db-audit": "保全对应时间窗口内的数据库访问日志",
  "auth-log": "保全对应时间窗口内的认证/登录日志",
  "gateway-log": "保全对应时间窗口内的出口网关/流量日志",
  "change-ticket": "收集变更/计划任务工单或审批记录",
  "owner-confirm": "收集业务负责人确认记录",
  "access-policy": "核对访问控制/权限策略配置摘录",
};

/** 已知 checklist key → 保持/微调为动作句（与 pack label 对齐） */
const CHECKLIST_ACTION_LABELS: Record<string, string> = {
  "verify-ticket": "核实该操作是否存在有效授权工单",
  "verify-owner": "联系业务负责人核实业务合理性",
  "verify-export": "核实导出数据类型、范围及数据去向",
  "verify-account": "确认实际使用人、账号归属与权限授权",
  "verify-network": "核查异常外联目标与出站流量",
  "escalate-ir": "按事件响应流程升级人工研判",
};

/**
 * 关键核查动作加权（展示排序，不改 pack）。
 * 使授权工单 / 使用人 / 日志保全等在 Top-N 中稳定出现。
 */
const SOURCE_KEY_PRIORITY_BOOST: Record<string, number> = {
  "verify-ticket": 40,
  "verify-account": 65,
  "verify-owner": 30,
  "verify-export": 40,
  "escalate-ir": 40,
  "change-ticket": 28,
  "owner-confirm": 18,
  "db-audit": 28,
  "auth-log": 32,
  "gateway-log": 12,
  changeTicketId: 8,
  businessOwnerConfirmed: 8,
  destinationRegion: 8,
  accountName: 20,
};

export function caseComplianceChecklistGroupTitle(
  kind: CaseComplianceChecklistKind,
): string {
  switch (kind) {
    case "CONTEXT":
      return "待确认信息";
    case "EVIDENCE":
      return "建议收集证据";
    case "CHECKLIST":
      return "建议核查动作";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function actionLabelForSuggestion(
  kind: CaseComplianceChecklistKind,
  sourceKey: string,
  fallbackLabel: string,
): string {
  if (kind === "CONTEXT") {
    return CONTEXT_ACTION_LABELS[sourceKey] ?? `确认${fallbackLabel}`;
  }
  if (kind === "EVIDENCE") {
    return EVIDENCE_ACTION_LABELS[sourceKey] ?? `收集${fallbackLabel}`;
  }
  return CHECKLIST_ACTION_LABELS[sourceKey] ?? fallbackLabel;
}

function itemKey(kind: CaseComplianceChecklistKind, sourceKey: string): string {
  return `${kind}:${sourceKey}`;
}

function strongerRelevance(
  a: CaseComplianceRelevance,
  b: CaseComplianceRelevance,
): CaseComplianceRelevance {
  return RELEVANCE_STRENGTH[a] <= RELEVANCE_STRENGTH[b] ? a : b;
}

/**
 * 优先级：数值越小越优先。
 * INSUFFICIENT_CONTEXT 的 ContextRequirement 最高；
 * ESCALATION_TRIGGER / POSSIBLE_OBLIGATION 其次；CONTROL_SUPPORT 再次。
 */
export function scoreComplianceChecklistCandidate(input: {
  kind: CaseComplianceChecklistKind;
  relevance: CaseComplianceRelevance;
  relationType: ControlClauseRelation;
  sourceKey?: string;
}): number {
  let score = 100;
  if (
    input.kind === "CONTEXT" &&
    input.relevance === "INSUFFICIENT_CONTEXT"
  ) {
    score -= 50;
  } else if (input.relevance === "INSUFFICIENT_CONTEXT") {
    score -= 30;
  }

  if (input.relationType === "ESCALATION_TRIGGER") {
    score -= 20;
  } else if (input.relationType === "POSSIBLE_OBLIGATION") {
    score -= 15;
  }

  if (input.kind === "CONTEXT") score -= 5;
  else if (input.kind === "CHECKLIST") score -= 2;

  if (input.relevance === "POSSIBLE") score -= 3;
  if (input.relevance === "DIRECT") score -= 8;

  if (input.sourceKey) {
    score -= SOURCE_KEY_PRIORITY_BOOST[input.sourceKey] ?? 0;
  }

  return score;
}

type Aggregate = CaseComplianceChecklistItem;

function upsertAggregate(
  map: Map<string, Aggregate>,
  draft: Aggregate,
): void {
  const existing = map.get(draft.key);
  if (!existing) {
    map.set(draft.key, {
      ...draft,
      controlCodes: [...draft.controlCodes].sort(),
      clauseRefs: [...draft.clauseRefs],
      relationTypes: [...draft.relationTypes],
      ruleIds: [...draft.ruleIds].sort(),
      supportingRuleIds: [...draft.supportingRuleIds].sort(),
      evidenceIds: [...draft.evidenceIds].sort(),
    });
    return;
  }

  existing.priority = Math.min(existing.priority, draft.priority);
  existing.relevance = strongerRelevance(existing.relevance, draft.relevance);
  if (!existing.description && draft.description) {
    existing.description = draft.description;
  }
  for (const code of draft.controlCodes) {
    if (!existing.controlCodes.includes(code)) existing.controlCodes.push(code);
  }
  existing.controlCodes.sort();
  for (const ref of draft.clauseRefs) {
    const id = `${ref.documentCanonicalCode}::${ref.clauseKey}`;
    if (
      !existing.clauseRefs.some(
        (r) => `${r.documentCanonicalCode}::${r.clauseKey}` === id,
      )
    ) {
      existing.clauseRefs.push(ref);
    }
  }
  existing.clauseRefs.sort((a, b) => {
    const dc = a.documentCanonicalCode.localeCompare(b.documentCanonicalCode);
    if (dc !== 0) return dc;
    return a.clauseKey.localeCompare(b.clauseKey);
  });
  for (const rel of draft.relationTypes) {
    if (!existing.relationTypes.includes(rel)) existing.relationTypes.push(rel);
  }
  for (const id of draft.ruleIds) {
    if (!existing.ruleIds.includes(id)) existing.ruleIds.push(id);
  }
  existing.ruleIds.sort();
  for (const id of draft.supportingRuleIds) {
    if (!existing.supportingRuleIds.includes(id)) {
      existing.supportingRuleIds.push(id);
    }
  }
  existing.supportingRuleIds.sort();
  for (const id of draft.evidenceIds) {
    if (!existing.evidenceIds.includes(id)) existing.evidenceIds.push(id);
  }
  existing.evidenceIds.sort();
}

function contributeFromFinding(
  map: Map<string, Aggregate>,
  finding: CaseComplianceFinding,
): void {
  const baseRuleIds = [
    ...new Set([finding.ruleId, ...finding.supportingRuleIds]),
  ];
  const clauseRef = {
    clauseKey: finding.clauseKey,
    documentCanonicalCode: finding.documentCanonicalCode,
  };

  const push = (
    kind: CaseComplianceChecklistKind,
    sourceKey: string,
    label: string,
    description?: string,
  ) => {
    const priority = scoreComplianceChecklistCandidate({
      kind,
      relevance: finding.relevance,
      relationType: finding.relationType,
      sourceKey,
    });
    upsertAggregate(map, {
      key: itemKey(kind, sourceKey),
      sourceKey,
      label: actionLabelForSuggestion(kind, sourceKey, label),
      description,
      kind,
      priority,
      controlCodes: [finding.controlCode],
      clauseRefs: [clauseRef],
      relevance: finding.relevance,
      relationTypes: [finding.relationType],
      ruleIds: baseRuleIds,
      supportingRuleIds: [...finding.supportingRuleIds],
      evidenceIds: [...finding.evidenceIds],
    });
  };

  // 待确认信息：仅 missingContext（已满足的上下文不再提示）
  for (const ctx of finding.missingContext) {
    push("CONTEXT", ctx.key, ctx.label, ctx.description);
  }
  for (const ev of finding.suggestedEvidence) {
    push("EVIDENCE", ev.key, ev.label, ev.description);
  }
  for (const cl of finding.suggestedChecklist) {
    push("CHECKLIST", cl.key, cl.label, cl.description);
  }
}

function compareItems(
  a: CaseComplianceChecklistItem,
  b: CaseComplianceChecklistItem,
): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ka = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (ka !== 0) return ka;
  return a.key.localeCompare(b.key);
}

/** 各 kind 软上限（合计 8），避免单一类型占满 Top-N */
const KIND_SOFT_CAPS: Record<CaseComplianceChecklistKind, number> = {
  CONTEXT: 2,
  EVIDENCE: 2,
  CHECKLIST: 4,
};

/**
 * 去重后按优先级 + kind 软配额选取 Top-N（非简单 slice）。
 */
export function selectTopComplianceChecklistItems(
  items: readonly CaseComplianceChecklistItem[],
  topN: number,
): CaseComplianceChecklistItem[] {
  if (topN <= 0) return [];
  const sorted = [...items].sort(compareItems);
  if (sorted.length <= topN) return sorted;

  const byKind: Record<
    CaseComplianceChecklistKind,
    CaseComplianceChecklistItem[]
  > = {
    CONTEXT: [],
    EVIDENCE: [],
    CHECKLIST: [],
  };
  for (const item of sorted) {
    byKind[item.kind].push(item);
  }

  const selected: CaseComplianceChecklistItem[] = [];
  const selectedKeys = new Set<string>();
  const takenByKind: Record<CaseComplianceChecklistKind, number> = {
    CONTEXT: 0,
    EVIDENCE: 0,
    CHECKLIST: 0,
  };

  // 第一轮：按 kind 软上限取优先项
  for (const kind of KIND_ORDER) {
    const cap = Math.min(KIND_SOFT_CAPS[kind], byKind[kind].length);
    for (const item of byKind[kind]) {
      if (takenByKind[kind] >= cap) break;
      if (selected.length >= topN) break;
      selected.push(item);
      selectedKeys.add(item.key);
      takenByKind[kind] += 1;
    }
  }

  // 第二轮：剩余名额按全局优先级回填
  for (const item of sorted) {
    if (selected.length >= topN) break;
    if (selectedKeys.has(item.key)) continue;
    selected.push(item);
    selectedKeys.add(item.key);
  }

  return selected.sort(compareItems);
}

export function buildCaseComplianceChecklistView(
  findings: readonly CaseComplianceFinding[],
  topN: number = CASE_UI_COMPLIANCE_CHECKLIST_TOP_N,
): CaseComplianceChecklistView {
  const map = new Map<string, Aggregate>();
  for (const finding of findings) {
    contributeFromFinding(map, finding);
  }

  const selected = selectTopComplianceChecklistItems([...map.values()], topN);

  const groups: CaseComplianceChecklistGroup[] = [];
  for (const kind of KIND_ORDER) {
    const items = selected.filter((i) => i.kind === kind);
    if (items.length === 0) continue;
    groups.push({
      kind,
      title: caseComplianceChecklistGroupTitle(kind),
      items,
    });
  }

  return {
    groups,
    totalCount: selected.length,
    empty: selected.length === 0,
  };
}

export function emptyCaseComplianceChecklistView(): CaseComplianceChecklistView {
  return { groups: [], totalCount: 0, empty: true };
}
