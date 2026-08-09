/**
 * v1.4 Step 4：Case UI「合规参考」面板视图（纯函数，可安全被 Client Component 引用）。
 *
 * 服务端加载见 loadCaseCompliancePanel.ts；前端不得重跑 Rule→Control→Clause。
 */
import type {
  CaseComplianceFinding,
  CaseComplianceRelevance,
  ComplianceReferenceSnapshot,
  ContentMode,
  ContextRequirement,
  ControlClauseRelation,
  VersionSelectionBasis,
} from "@/domain/knowledge";

/** Case UI Top-N：落在产品要求的 5～8 区间，由后端分层配额截断 */
export const CASE_UI_COMPLIANCE_TOP_N = 8;

export const CASE_COMPLIANCE_PANEL_DISCLAIMER =
  "法规与制度关联结果用于安全研判和核查辅助，不构成违法认定、合规认证或法律意见。";

/** 禁止肯定性违法/违规结论措辞（否定免责声明中的「不构成…」不在此列） */
export const FORBIDDEN_CASE_COMPLIANCE_UI_PHRASES =
  /已违法|违反了|违反《|已违规|法律责任成立|合规结论：不合规/;

export type CaseCompliancePanelItem = {
  /** documentCanonicalCode::versionKey::clauseKey */
  id: string;
  documentTitle: string;
  documentCanonicalCode: string;
  articleNumber: string | null;
  clauseHeading: string | null;
  clauseLabel: string;
  clauseKey: string;
  relevance: CaseComplianceRelevance;
  controlCodes: string[];
  /** 首屏摘要：不含 ruleId */
  summary: string;
  versionLabel: string;
  versionKey: string;
  versionSelectionBasis: VersionSelectionBasis;
  caseDate: string | null;
  contentMode: ContentMode;
  isSummaryOnly: boolean;
  sourceUrl: string | null;
  missingContext: ContextRequirement[];
  /** 审计：主规则 + supporting */
  ruleIds: string[];
  supportingRuleIds: string[];
  evidenceIds: string[];
  relationTypes: ControlClauseRelation[];
};

export type CaseCompliancePanelGroup = {
  relevance: CaseComplianceRelevance;
  title: string;
  items: CaseCompliancePanelItem[];
};

export type CaseCompliancePanelView = {
  groups: CaseCompliancePanelGroup[];
  totalCount: number;
  empty: boolean;
};

const RELEVANCE_STRENGTH: Record<CaseComplianceRelevance, number> = {
  DIRECT: 0,
  RELEVANT: 1,
  POSSIBLE: 2,
  INSUFFICIENT_CONTEXT: 3,
};

const GROUP_ORDER: readonly CaseComplianceRelevance[] = [
  "DIRECT",
  "RELEVANT",
  "POSSIBLE",
  "INSUFFICIENT_CONTEXT",
];

export function formatCaseComplianceRelevanceLabel(
  relevance: CaseComplianceRelevance,
): string {
  switch (relevance) {
    case "RELEVANT":
      return "与当前安全事件存在相关性";
    case "POSSIBLE":
      return "可能涉及相关要求，需结合业务背景进一步确认";
    case "INSUFFICIENT_CONTEXT":
      return "当前缺少必要上下文，暂无法判断";
    case "DIRECT":
      return "与当前事件直接相关";
    default: {
      const _exhaustive: never = relevance;
      return _exhaustive;
    }
  }
}

export function caseComplianceGroupTitle(
  relevance: CaseComplianceRelevance,
): string {
  switch (relevance) {
    case "RELEVANT":
      return "相关合规参考";
    case "POSSIBLE":
      return "可能相关要求";
    case "INSUFFICIENT_CONTEXT":
      return "需补充上下文";
    case "DIRECT":
      return "直接相关";
    default: {
      const _exhaustive: never = relevance;
      return _exhaustive;
    }
  }
}

export function clauseLabelFromParts(
  articleNumber: string | null,
  clauseHeading: string | null,
  clauseKey: string,
): string {
  const article = articleNumber?.trim();
  const heading = clauseHeading?.trim();
  if (article && heading) return `${article} ${heading}`;
  if (article) return article;
  if (heading) return heading;
  return clauseKey;
}

export function isSummaryOnlyReference(input: {
  contentMode: ContentMode;
  documentCanonicalCode: string;
}): boolean {
  return (
    input.contentMode === "SUMMARY_ONLY" ||
    input.contentMode === "METADATA_ONLY" ||
    input.documentCanonicalCode.startsWith("CN-GBT-")
  );
}

function buildSummary(input: {
  isSummaryOnly: boolean;
  relevance: CaseComplianceRelevance;
  missingContext: ContextRequirement[];
  controlCodes: string[];
}): string {
  if (input.isSummaryOnly) {
    return "标准要求摘要/控制参考，供安全核查辅助，非法规原文引用。";
  }
  if (
    input.relevance === "INSUFFICIENT_CONTEXT" &&
    input.missingContext.length > 0
  ) {
    return `暂无法判断：缺少${input.missingContext.map((m) => m.label).join("、")}。`;
  }
  const controls =
    input.controlCodes.length > 0
      ? `关联控制 ${input.controlCodes.join("、")}。`
      : "";
  return `该条款与当前案件关联控制存在知识映射，供人工进一步核实。${controls}`;
}

type CollapseBucket = {
  item: CaseCompliancePanelItem;
};

/**
 * 由后端已截断的 snapshots（+ 可选 findings 补 missingContext）构建面板视图。
 * 按 document+version+clause 去重；取更强 relevance。
 */
export function buildCaseCompliancePanelView(
  snapshots: readonly ComplianceReferenceSnapshot[],
  findings: readonly CaseComplianceFinding[] = [],
): CaseCompliancePanelView {
  const missingByKey = new Map<string, ContextRequirement[]>();
  for (const f of findings) {
    const key = `${f.documentCanonicalCode}::${f.versionKey}::${f.clauseKey}`;
    const prev = missingByKey.get(key) ?? [];
    const map = new Map(prev.map((m) => [m.key, m]));
    for (const m of f.missingContext) map.set(m.key, m);
    missingByKey.set(key, [...map.values()]);
  }

  const buckets = new Map<string, CollapseBucket>();

  for (const snap of snapshots) {
    const id = `${snap.documentCanonicalCode}::${snap.versionKey}::${snap.clauseKey}`;
    const isSummaryOnly = isSummaryOnlyReference(snap);
    const missingContext = missingByKey.get(id) ?? [];
    const ruleIds = [...new Set([snap.ruleId, ...snap.supportingRuleIds])].sort();
    const controlCodes = [snap.controlCode];
    const clauseLabel = clauseLabelFromParts(
      snap.articleNumber,
      snap.clauseHeading,
      snap.clauseKey,
    );

    const existing = buckets.get(id);
    if (!existing) {
      const item: CaseCompliancePanelItem = {
        id,
        documentTitle: snap.documentTitle,
        documentCanonicalCode: snap.documentCanonicalCode,
        articleNumber: snap.articleNumber,
        clauseHeading: snap.clauseHeading,
        clauseLabel,
        clauseKey: snap.clauseKey,
        relevance: snap.relevance,
        controlCodes,
        summary: "",
        versionLabel: snap.versionLabel,
        versionKey: snap.versionKey,
        versionSelectionBasis: snap.versionSelectionBasis,
        caseDate: snap.caseDate,
        contentMode: snap.contentMode,
        isSummaryOnly,
        sourceUrl: snap.sourceUrl,
        missingContext,
        ruleIds,
        supportingRuleIds: [...snap.supportingRuleIds].sort(),
        evidenceIds: [...snap.evidenceIds].sort(),
        relationTypes: [snap.relationType],
      };
      item.summary = buildSummary(item);
      buckets.set(id, { item });
      continue;
    }

    const item = existing.item;
    if (
      RELEVANCE_STRENGTH[snap.relevance] < RELEVANCE_STRENGTH[item.relevance]
    ) {
      item.relevance = snap.relevance;
    }
    if (!item.controlCodes.includes(snap.controlCode)) {
      item.controlCodes.push(snap.controlCode);
      item.controlCodes.sort();
    }
    for (const idRule of ruleIds) {
      if (!item.ruleIds.includes(idRule)) item.ruleIds.push(idRule);
    }
    item.ruleIds.sort();
    for (const idRule of snap.supportingRuleIds) {
      if (!item.supportingRuleIds.includes(idRule)) {
        item.supportingRuleIds.push(idRule);
      }
    }
    item.supportingRuleIds.sort();
    for (const eid of snap.evidenceIds) {
      if (!item.evidenceIds.includes(eid)) item.evidenceIds.push(eid);
    }
    item.evidenceIds.sort();
    if (!item.relationTypes.includes(snap.relationType)) {
      item.relationTypes.push(snap.relationType);
    }
    for (const m of missingContext) {
      if (!item.missingContext.some((x) => x.key === m.key)) {
        item.missingContext.push(m);
      }
    }
    item.isSummaryOnly = item.isSummaryOnly || isSummaryOnly;
    item.summary = buildSummary(item);
  }

  const items = [...buckets.values()]
    .map((b) => b.item)
    .sort((a, b) => {
      const rr =
        RELEVANCE_STRENGTH[a.relevance] - RELEVANCE_STRENGTH[b.relevance];
      if (rr !== 0) return rr;
      const dc = a.documentCanonicalCode.localeCompare(b.documentCanonicalCode);
      if (dc !== 0) return dc;
      return a.clauseKey.localeCompare(b.clauseKey);
    });

  const groups: CaseCompliancePanelGroup[] = [];
  for (const relevance of GROUP_ORDER) {
    const groupItems = items.filter((i) => i.relevance === relevance);
    if (groupItems.length === 0) continue;
    groups.push({
      relevance,
      title: caseComplianceGroupTitle(relevance),
      items: groupItems,
    });
  }

  return {
    groups,
    totalCount: items.length,
    empty: items.length === 0,
  };
}

export function emptyCaseCompliancePanelView(): CaseCompliancePanelView {
  return { groups: [], totalCount: 0, empty: true };
}
