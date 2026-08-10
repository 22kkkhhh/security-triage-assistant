/**
 * Case UI 合规参考面板：视图构建 + Case A/B 分布（纯函数，无 DB）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type {
  CaseComplianceFinding,
  CaseComplianceRelevance,
  ComplianceReferenceSnapshot,
  ContentMode,
} from "@/domain/knowledge";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { resolveCaseComplianceFromGraph } from "@/services/knowledge/resolveCaseCompliance";
import {
  CASE_COMPLIANCE_PANEL_DISCLAIMER,
  CASE_UI_COMPLIANCE_TOP_N,
  FORBIDDEN_CASE_COMPLIANCE_UI_PHRASES,
  buildCaseCompliancePanelView,
  emptyCaseCompliancePanelView,
  formatCaseComplianceRelevanceLabel,
} from "@/services/knowledge/caseCompliancePanel";

const CAPTURED = "2026-08-09T12:00:00.000Z";
const graph = curatedPackToResolutionGraph();

function snap(
  overrides: Partial<ComplianceReferenceSnapshot> &
    Pick<
      ComplianceReferenceSnapshot,
      | "documentCanonicalCode"
      | "clauseKey"
      | "relevance"
      | "controlCode"
    >,
): ComplianceReferenceSnapshot {
  return {
    documentId: "doc",
    documentVersionId: "ver",
    documentTitle: overrides.documentTitle ?? "测试法规",
    versionKey: overrides.versionKey ?? "2021-original",
    versionLabel: overrides.versionLabel ?? "2021 施行",
    clauseId: overrides.clauseId ?? overrides.clauseKey,
    articleNumber: overrides.articleNumber ?? "第二十七条",
    clauseHeading: overrides.clauseHeading ?? "安全保护义务",
    relationType: overrides.relationType ?? "CONTROL_SUPPORT",
    rationaleSnapshot: overrides.rationaleSnapshot ?? "基于命中规则 DATA-001 关联。",
    sourceUrl:
      overrides.sourceUrl !== undefined
        ? overrides.sourceUrl
        : "https://www.npc.gov.cn/",
    issuingAuthority:
      overrides.issuingAuthority !== undefined
        ? overrides.issuingAuthority
        : "全国人民代表大会常务委员会",
    effectiveDate:
      overrides.effectiveDate !== undefined
        ? overrides.effectiveDate
        : "2021-09-01",
    sourceType:
      overrides.sourceType !== undefined
        ? overrides.sourceType
        : "OFFICIAL_PUBLIC",
    capturedAt: CAPTURED,
    caseDate: overrides.caseDate ?? "2026-08-08",
    versionSelectionBasis: overrides.versionSelectionBasis ?? "CASE_DATE",
    controlId: overrides.controlId ?? overrides.controlCode,
    ruleId: overrides.ruleId ?? "DATA-001",
    supportingRuleIds: overrides.supportingRuleIds ?? [],
    evidenceIds: overrides.evidenceIds ?? ["ev-1"],
    contentMode: overrides.contentMode ?? ("FULL_TEXT" as ContentMode),
    documentCanonicalCode: overrides.documentCanonicalCode,
    clauseKey: overrides.clauseKey,
    relevance: overrides.relevance,
    controlCode: overrides.controlCode,
  };
}

function finding(
  overrides: Partial<CaseComplianceFinding> &
    Pick<
      CaseComplianceFinding,
      "documentCanonicalCode" | "clauseKey" | "relevance" | "controlCode"
    >,
): CaseComplianceFinding {
  return {
    ruleId: overrides.ruleId ?? "DATA-001",
    supportingRuleIds: overrides.supportingRuleIds ?? [],
    evidenceIds: overrides.evidenceIds ?? [],
    controlId: overrides.controlCode,
    controlCode: overrides.controlCode,
    documentId: "doc",
    documentCanonicalCode: overrides.documentCanonicalCode,
    documentVersionId: "ver",
    versionKey: overrides.versionKey ?? "2021-original",
    clauseId: overrides.clauseKey,
    clauseKey: overrides.clauseKey,
    relationType: overrides.relationType ?? "CONTROL_SUPPORT",
    relevance: overrides.relevance,
    rationale: "test",
    missingContext: overrides.missingContext ?? [],
    suggestedEvidence: [],
    suggestedChecklist: [],
    versionSelectionBasis: "CASE_DATE",
    caseDate: "2026-08-08",
  };
}

function resolvePanel(draft: typeof caseA) {
  const analyzed = analyzeSecurityCase(draft);
  const resolved = resolveCaseComplianceFromGraph(
    {
      draft,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      capturedAt: CAPTURED,
      topN: CASE_UI_COMPLIANCE_TOP_N,
    },
    graph,
  );
  return {
    resolved,
    view: buildCaseCompliancePanelView(resolved.snapshots, resolved.findings),
  };
}

describe("formatCaseComplianceRelevanceLabel", () => {
  it("使用 Case UI 指定文案，且不含违法/违规措辞", () => {
    const labels: CaseComplianceRelevance[] = [
      "RELEVANT",
      "POSSIBLE",
      "INSUFFICIENT_CONTEXT",
      "DIRECT",
    ];
    for (const r of labels) {
      const text = formatCaseComplianceRelevanceLabel(r);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(FORBIDDEN_CASE_COMPLIANCE_UI_PHRASES);
    }
    expect(formatCaseComplianceRelevanceLabel("RELEVANT")).toContain(
      "存在相关性",
    );
    expect(formatCaseComplianceRelevanceLabel("POSSIBLE")).toContain(
      "可能涉及",
    );
    expect(formatCaseComplianceRelevanceLabel("INSUFFICIENT_CONTEXT")).toContain(
      "缺少必要上下文",
    );
    expect(formatCaseComplianceRelevanceLabel("DIRECT")).toContain("直接相关");
  });
});

describe("buildCaseCompliancePanelView", () => {
  it("空 snapshots → 空态", () => {
    const view = buildCaseCompliancePanelView([]);
    expect(view).toEqual(emptyCaseCompliancePanelView());
    expect(view.empty).toBe(true);
  });

  it("duplicate clause 折叠为一条，取更强 relevance 并合并 controlCodes", () => {
    const view = buildCaseCompliancePanelView([
      snap({
        documentCanonicalCode: "CN-DSL",
        clauseKey: "article-27",
        relevance: "INSUFFICIENT_CONTEXT",
        controlCode: "CTRL-A",
      }),
      snap({
        documentCanonicalCode: "CN-DSL",
        clauseKey: "article-27",
        relevance: "RELEVANT",
        controlCode: "CTRL-B",
        ruleId: "DATA-002",
      }),
    ]);
    expect(view.totalCount).toBe(1);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]!.relevance).toBe("RELEVANT");
    expect(view.groups[0]!.items[0]!.controlCodes).toEqual(["CTRL-A", "CTRL-B"]);
  });

  it("空分组不出现在 groups；INSUFFICIENT 缺失时不生成该 section", () => {
    const view = buildCaseCompliancePanelView([
      snap({
        documentCanonicalCode: "CN-DSL",
        clauseKey: "article-21",
        relevance: "RELEVANT",
        controlCode: "CTRL-X",
      }),
      snap({
        documentCanonicalCode: "CN-PIPL",
        clauseKey: "article-13",
        relevance: "POSSIBLE",
        controlCode: "CTRL-Y",
        relationType: "POSSIBLE_OBLIGATION",
      }),
    ]);
    expect(view.groups.map((g) => g.relevance)).toEqual([
      "RELEVANT",
      "POSSIBLE",
    ]);
    expect(
      view.groups.some((g) => g.relevance === "INSUFFICIENT_CONTEXT"),
    ).toBe(false);
  });

  it("GB/T SUMMARY_ONLY 标识为标准要求摘要/控制参考；summary 不含 ruleId", () => {
    const view = buildCaseCompliancePanelView([
      snap({
        documentCanonicalCode: "CN-GBT-22239",
        documentTitle: "信息安全技术 网络安全等级保护基本要求",
        clauseKey: "req-access-control",
        articleNumber: null,
        clauseHeading: "访问控制",
        relevance: "RELEVANT",
        controlCode: "CTRL-DATA-ACCESS-01",
        contentMode: "SUMMARY_ONLY",
        sourceUrl: "https://openstd.samr.gov.cn/",
        issuingAuthority: "国家市场监督管理总局",
        rationaleSnapshot: "基于命中规则 DATA-001 关联控制 CTRL-DATA-ACCESS-01。",
      }),
    ]);
    const item = view.groups[0]!.items[0]!;
    expect(item.isSummaryOnly).toBe(true);
    expect(item.summary).toMatch(/标准要求摘要\/控制参考/);
    expect(item.summary).not.toMatch(/DATA-001/);
    expect(item.ruleIds).toContain("DATA-001");
    expect(item.officialSource.available).toBe(true);
    expect(item.officialSource.allowsOriginalClauseView).toBe(false);
    expect(item.officialSource.href).toContain("openstd.samr.gov.cn");
  });

  it("无可用官方来源时 officialSource 空态；version/authority 仍展示", () => {
    const view = buildCaseCompliancePanelView([
      snap({
        documentCanonicalCode: "CN-DSL",
        clauseKey: "article-27",
        relevance: "RELEVANT",
        controlCode: "CTRL-DATA-ACCESS-01",
        sourceUrl: null,
        issuingAuthority: "全国人民代表大会常务委员会",
        effectiveDate: "2021-09-01",
        versionLabel: "2021年公布施行",
        versionKey: "2021-original",
      }),
    ]);
    const item = view.groups[0]!.items[0]!;
    expect(item.officialSource.available).toBe(false);
    expect(item.officialSource.emptyMessage).toMatch(/暂无可用官方来源/);
    expect(item.issuingAuthority).toContain("全国人民代表大会");
    expect(item.effectiveDate).toBe("2021-09-01");
    expect(item.versionKey).toBe("2021-original");
  });

  it("首屏 summary 不含 ruleId；ruleIds 仅在审计字段", () => {
    const view = buildCaseCompliancePanelView(
      [
        snap({
          documentCanonicalCode: "CN-DSL",
          clauseKey: "article-27",
          relevance: "RELEVANT",
          controlCode: "CTRL-DATA-ACCESS-01",
          ruleId: "DATA-001",
          supportingRuleIds: ["DATA-002"],
        }),
      ],
      [
        finding({
          documentCanonicalCode: "CN-DSL",
          clauseKey: "article-27",
          relevance: "RELEVANT",
          controlCode: "CTRL-DATA-ACCESS-01",
          missingContext: [],
        }),
      ],
    );
    const item = view.groups[0]!.items[0]!;
    expect(item.summary).not.toMatch(/DATA-\d+/);
    expect(item.ruleIds).toEqual(["DATA-001", "DATA-002"]);
  });
});

describe("Case A/B panel distribution（curated pack）", () => {
  it("Case A：三种 relevance 分组均存在；条目不超过 Top-N", () => {
    const { view, resolved } = resolvePanel(caseA);
    expect(resolved.findings.length).toBeLessThanOrEqual(CASE_UI_COMPLIANCE_TOP_N);
    expect(view.empty).toBe(false);
    const relevances = view.groups.map((g) => g.relevance);
    expect(relevances).toContain("RELEVANT");
    expect(relevances).toContain("POSSIBLE");
    expect(relevances).toContain("INSUFFICIENT_CONTEXT");
    expect(view.totalCount).toBeGreaterThan(0);
    expect(view.totalCount).toBeLessThanOrEqual(CASE_UI_COMPLIANCE_TOP_N);
  });

  it("Case B：有 POSSIBLE；空 grouping 不出现（含无 INSUFFICIENT 时不渲染空 section）", () => {
    const { view } = resolvePanel(caseB);
    expect(view.empty).toBe(false);
    expect(view.groups.some((g) => g.relevance === "POSSIBLE")).toBe(true);
    expect(view.groups.some((g) => g.relevance === "RELEVANT")).toBe(true);
    // 任一分组必须有条目；不得为了占位渲染空的「需补充上下文」
    expect(view.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("面板文案与免责声明不含禁止措辞", () => {
    const { view } = resolvePanel(caseA);
    const blob = [
      CASE_COMPLIANCE_PANEL_DISCLAIMER,
      ...view.groups.flatMap((g) => [
        g.title,
        ...g.items.flatMap((i) => [
          i.summary,
          formatCaseComplianceRelevanceLabel(i.relevance),
          i.documentTitle,
          i.clauseLabel,
        ]),
      ]),
    ].join("\n");
    expect(blob).not.toMatch(FORBIDDEN_CASE_COMPLIANCE_UI_PHRASES);
    expect(blob).toContain("不构成违法认定");
  });
});

describe("CaseCompliancePanel UI 契约（源码）", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const panel = readFileSync(
    path.join(root, "components/cases/CaseCompliancePanel.tsx"),
    "utf8",
  );
  const workbench = readFileSync(
    path.join(root, "components/cases/PersistedCaseWorkbench.tsx"),
    "utf8",
  );
  const page = readFileSync(
    path.join(root, "app/(app)/cases/[id]/page.tsx"),
    "utf8",
  );

  it("默认折叠技术详情；ruleId 仅在二级技术详情块", () => {
    expect(panel).toContain("技术详情");
    expect(panel).toContain("展开详情");
    expect(panel).toContain("{open &&");
    expect(panel).toContain("item.ruleIds");
    expect(panel).not.toContain("审计信息");
    expect(panel).not.toContain("supportingRuleIds：");
    // 一级详情区域不直接渲染 ruleIds（仅出现在技术详情 children）
    const beforeTech = panel.split("技术详情")[0] ?? "";
    expect(beforeTech).not.toContain("{item.ruleIds");
  });

  it("空态文案与 GB/T 摘要标签存在；分组为空不渲染依赖 groups.map", () => {
    expect(panel).toContain("当前未发现可展示的合规参考");
    expect(panel).toContain("标准要求摘要/控制参考");
    expect(panel).toContain("view.groups.map");
    expect(panel).not.toMatch(/已违法|违反XX法|法律责任成立/);
  });

  it("工作台只读接入服务端 view；页面调用 loadCaseDetailPageData", () => {
    expect(workbench).toContain("CaseCompliancePanel");
    expect(workbench).toContain("compliancePanel");
    expect(workbench).not.toContain("resolveCaseCompliance");
    expect(workbench).not.toContain("curatedPackToResolutionGraph");
    expect(page).toContain("loadCaseDetailPageData");
    expect(page).toContain("compliancePanel={runtimeViews.compliance.panel}");
  });


  it("原有 Case 工作台关键面板仍在", () => {
    expect(workbench).toContain("FindingsSummary");
    expect(workbench).toContain("DimensionPanels");
    expect(workbench).toContain("EvidencePanel");
    expect(workbench).toContain("HumanReviewPanel");
    expect(workbench).toContain("ChecklistPanel");
  });
});
