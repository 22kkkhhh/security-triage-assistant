/**
 * v1.4 Step 2C：合规 Snapshot → 报告章节（纯函数）。
 * 只消费 Snapshot，禁止查询 Knowledge DB / 重选法规版本。
 */
import type {
  CaseComplianceRelevance,
  ComplianceReferenceSnapshot,
  ContentMode,
} from "@/domain/knowledge";
import type { ReportSection } from "@/domain/types";

export const COMPLIANCE_REPORT_DISCLAIMER =
  "说明：以下内容为案件报告生成时固化的合规参考快照，仅用于辅助核查可能相关的制度或标准要求；最终研判结论以人工确认为准，本报告不对行为作出法律责任或合规符合性认定。";

/**
 * 报告合规章节禁止自动生成的肯定性违法/违规措辞。
 * 允许“不构成…认定”等否定免责表述以外的中性措辞；本模块免责声明已避免使用下列字样。
 */
export const FORBIDDEN_COMPLIANCE_REPORT_PHRASES =
  /已违法|构成违法|确认违法|已违规|违反了|违反《|法律意见|违法判定|违规结论/;

export type CollapsedComplianceReference = {
  documentCanonicalCode: string;
  documentTitle: string;
  versionKey: string;
  versionLabel: string;
  clauseKey: string;
  articleNumber: string | null;
  clauseHeading: string | null;
  relevance: CaseComplianceRelevance;
  contentMode: ContentMode;
  sourceUrl: string | null;
  caseDate: string | null;
  versionSelectionBasis: ComplianceReferenceSnapshot["versionSelectionBasis"];
  rationaleSnapshot: string | null;
  /** 审计信息：不在正文堆砌 ruleId */
  controlCodes: string[];
  supportingRuleIds: string[];
  evidenceIds: string[];
  relationTypes: ComplianceReferenceSnapshot["relationType"][];
};

const RELEVANCE_STRENGTH: Record<CaseComplianceRelevance, number> = {
  DIRECT: 0,
  RELEVANT: 1,
  POSSIBLE: 2,
  INSUFFICIENT_CONTEXT: 3,
};

export function formatComplianceRelevanceText(
  relevance: CaseComplianceRelevance,
): string {
  switch (relevance) {
    case "RELEVANT":
      return "存在相关性";
    case "POSSIBLE":
      return "可能涉及，需结合业务背景进一步确认";
    case "INSUFFICIENT_CONTEXT":
      return "当前缺少必要上下文，暂无法判断";
    case "DIRECT":
      return "直接相关";
    default: {
      const _exhaustive: never = relevance;
      return _exhaustive;
    }
  }
}

export function collapseComplianceSnapshots(
  snapshots: readonly ComplianceReferenceSnapshot[],
): CollapsedComplianceReference[] {
  const map = new Map<string, CollapsedComplianceReference>();

  for (const snap of snapshots) {
    const key = `${snap.documentCanonicalCode}::${snap.versionKey}::${snap.clauseKey}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        documentCanonicalCode: snap.documentCanonicalCode,
        documentTitle: snap.documentTitle,
        versionKey: snap.versionKey,
        versionLabel: snap.versionLabel,
        clauseKey: snap.clauseKey,
        articleNumber: snap.articleNumber,
        clauseHeading: snap.clauseHeading,
        relevance: snap.relevance,
        contentMode: snap.contentMode,
        sourceUrl: snap.sourceUrl,
        caseDate: snap.caseDate,
        versionSelectionBasis: snap.versionSelectionBasis,
        rationaleSnapshot: snap.rationaleSnapshot,
        controlCodes: [snap.controlCode],
        supportingRuleIds: [
          ...new Set([snap.ruleId, ...snap.supportingRuleIds]),
        ],
        evidenceIds: [...snap.evidenceIds],
        relationTypes: [snap.relationType],
      });
      continue;
    }

    if (
      RELEVANCE_STRENGTH[snap.relevance] <
      RELEVANCE_STRENGTH[existing.relevance]
    ) {
      existing.relevance = snap.relevance;
    }
    if (!existing.controlCodes.includes(snap.controlCode)) {
      existing.controlCodes.push(snap.controlCode);
    }
    for (const id of [snap.ruleId, ...snap.supportingRuleIds]) {
      if (!existing.supportingRuleIds.includes(id)) {
        existing.supportingRuleIds.push(id);
      }
    }
    for (const id of snap.evidenceIds) {
      if (!existing.evidenceIds.includes(id)) existing.evidenceIds.push(id);
    }
    if (!existing.relationTypes.includes(snap.relationType)) {
      existing.relationTypes.push(snap.relationType);
    }
    if (!existing.rationaleSnapshot && snap.rationaleSnapshot) {
      existing.rationaleSnapshot = snap.rationaleSnapshot;
    }
  }

  return [...map.values()].sort((a, b) => {
    const rr =
      RELEVANCE_STRENGTH[a.relevance] - RELEVANCE_STRENGTH[b.relevance];
    if (rr !== 0) return rr;
    const dc = a.documentCanonicalCode.localeCompare(b.documentCanonicalCode);
    if (dc !== 0) return dc;
    return a.clauseKey.localeCompare(b.clauseKey);
  });
}

function clauseLabel(item: CollapsedComplianceReference): string {
  const article = item.articleNumber?.trim();
  const heading = item.clauseHeading?.trim();
  if (article && heading) return `${article} ${heading}`;
  if (article) return article;
  if (heading) return heading;
  return item.clauseKey;
}

function isSummaryOnlyReference(item: CollapsedComplianceReference): boolean {
  return (
    item.contentMode === "SUMMARY_ONLY" ||
    item.contentMode === "METADATA_ONLY" ||
    item.documentCanonicalCode.startsWith("CN-GBT-")
  );
}

function formatOneReference(
  index: number,
  item: CollapsedComplianceReference,
): string {
  const lines: string[] = [];
  lines.push(
    `${index}. 《${item.documentTitle}》（${item.versionLabel}） / ${clauseLabel(item)}`,
  );
  lines.push(`   关联程度：${formatComplianceRelevanceText(item.relevance)}。`);

  if (isSummaryOnlyReference(item)) {
    lines.push(
      "   引用说明：本条为标准/制度要求摘要或控制参考，非全文原文引用；详细条文请核验官方标准文本。",
    );
  } else {
    // 正文只用中性模板，避免把 mapping/engine 中的否定性“违法”字样带入报告
    lines.push(
      "   说明：该条款与案件命中分析所关联的控制项存在知识映射，供人工进一步核实。",
    );
  }
  // rationaleSnapshot / supportingRuleIds / evidenceIds 保留在 ReportData.complianceReferences 供审计

  const versionNote =
    item.versionSelectionBasis === "CASE_DATE" && item.caseDate
      ? `版本依据：案件日期 ${item.caseDate} 适用版本 ${item.versionKey}`
      : `版本依据：当前日期适用版本 ${item.versionKey}`;
  lines.push(`   ${versionNote}。`);

  // 审计向控制编码（不堆砌 ruleId）
  if (item.controlCodes.length > 0) {
    lines.push(`   关联控制：${item.controlCodes.sort().join("、")}。`);
  }

  return lines.join("\n");
}

function buildSectionContent(
  items: CollapsedComplianceReference[],
  emptyText: string,
): string {
  const body =
    items.length === 0
      ? emptyText
      : items.map((item, i) => formatOneReference(i + 1, item)).join("\n");
  return `${COMPLIANCE_REPORT_DISCLAIMER}\n\n${body}`;
}

/**
 * 由 Snapshot 构建三块合规报告章节。
 * snapshots 为空/undefined → 不生成章节（兼容旧草稿）。
 */
export function buildComplianceReportSections(
  snapshots: readonly ComplianceReferenceSnapshot[] | undefined | null,
): ReportSection[] {
  if (snapshots == null) return [];
  // 显式空数组：仍生成三节空态，标明已评估但无关联
  const collapsed = collapseComplianceSnapshots(snapshots);

  const relevant = collapsed.filter(
    (c) => c.relevance === "RELEVANT" || c.relevance === "DIRECT",
  );
  const possible = collapsed.filter((c) => c.relevance === "POSSIBLE");
  const insufficient = collapsed.filter(
    (c) => c.relevance === "INSUFFICIENT_CONTEXT",
  );

  // 若完全无 snapshot 输入（null）已返回；空数组则三节均空态
  if (snapshots.length === 0) {
    return [
      {
        key: "complianceRelevant",
        title: "相关合规参考",
        content: buildSectionContent([], "当前快照未包含相关合规参考条目。"),
      },
      {
        key: "compliancePossible",
        title: "可能相关要求",
        content: buildSectionContent([], "当前快照未包含可能相关要求条目。"),
      },
      {
        key: "complianceFurtherVerification",
        title: "建议进一步核实事项",
        content: buildSectionContent(
          [],
          "当前快照未包含因上下文不足而待核实的合规条目。",
        ),
      },
    ];
  }

  return [
    {
      key: "complianceRelevant",
      title: "相关合规参考",
      content: buildSectionContent(
        relevant,
        "当前证据下未形成“存在相关性/直接相关”的合规参考条目。",
      ),
    },
    {
      key: "compliancePossible",
      title: "可能相关要求",
      content: buildSectionContent(
        possible,
        "当前证据下未形成“可能涉及”的合规要求条目。",
      ),
    },
    {
      key: "complianceFurtherVerification",
      title: "建议进一步核实事项",
      content: buildSectionContent(
        insufficient,
        "当前无因缺少必要上下文而暂无法判断的合规条目。",
      ),
    },
  ];
}
