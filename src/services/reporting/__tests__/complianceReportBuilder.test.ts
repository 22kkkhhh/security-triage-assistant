/**
 * v1.4 Step 2C：合规 Snapshot → 报告章节 / DOCX 回归。
 */
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type { ComplianceReferenceSnapshot } from "@/domain/knowledge";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { resolveCaseComplianceFromGraph } from "@/services/knowledge/resolveCaseCompliance";
import {
  buildComplianceReportSections,
  collapseComplianceSnapshots,
  COMPLIANCE_REPORT_DISCLAIMER,
  FORBIDDEN_COMPLIANCE_REPORT_PHRASES,
  formatComplianceRelevanceText,
} from "@/services/reporting/complianceReportBuilder";
import {
  buildDocxSpec,
  generateDocxBuffer,
} from "@/services/reporting/docxGenerator";
import { buildReportData } from "@/services/reporting/reportBuilder";

const CAPTURED = "2026-08-09T12:00:00.000Z";
const graph = curatedPackToResolutionGraph();

function snap(
  overrides: Partial<ComplianceReferenceSnapshot>,
): ComplianceReferenceSnapshot {
  return {
    documentId: "d1",
    documentVersionId: "v1",
    documentCanonicalCode: "CN-DSL",
    documentTitle: "中华人民共和国数据安全法",
    versionKey: "2021-original",
    versionLabel: "2021年公布施行",
    clauseId: "c1",
    clauseKey: "article-27",
    articleNumber: "第二十七条",
    clauseHeading: "数据处理活动风险监测",
    relationType: "CONTROL_SUPPORT",
    rationaleSnapshot: "控制支撑测试说明。",
    sourceUrl: "https://www.npc.gov.cn/",
    issuingAuthority: "全国人民代表大会常务委员会",
    effectiveDate: "2021-09-01",
    sourceType: "OFFICIAL_PUBLIC",
    capturedAt: CAPTURED,
    caseDate: "2026-08-08",
    versionSelectionBasis: "CASE_DATE",
    controlId: "ctrl-1",
    controlCode: "CTRL-DATA-ACCESS-01",
    ruleId: "DATA-001",
    supportingRuleIds: [],
    evidenceIds: ["DATA-001-E1"],
    relevance: "RELEVANT",
    contentMode: "FULL_TEXT",
    ...overrides,
  };
}

describe("formatComplianceRelevanceText", () => {
  it("RELEVANT / POSSIBLE / INSUFFICIENT_CONTEXT / DIRECT 文案", () => {
    expect(formatComplianceRelevanceText("RELEVANT")).toBe("存在相关性");
    expect(formatComplianceRelevanceText("POSSIBLE")).toMatch(/可能涉及/);
    expect(formatComplianceRelevanceText("INSUFFICIENT_CONTEXT")).toMatch(
      /缺少必要上下文/,
    );
    expect(formatComplianceRelevanceText("DIRECT")).toBe("直接相关");
    expect(formatComplianceRelevanceText("DIRECT")).not.toMatch(/违法|违反/);
  });
});

describe("collapseComplianceSnapshots", () => {
  it("按 canonicalCode+versionKey+clauseKey 去重并合并 control/evidence", () => {
    const collapsed = collapseComplianceSnapshots([
      snap({
        controlCode: "CTRL-DATA-ACCESS-01",
        ruleId: "DATA-001",
        evidenceIds: ["E1"],
        relevance: "RELEVANT",
      }),
      snap({
        controlCode: "CTRL-PRIVACY-01",
        ruleId: "DATA-002",
        supportingRuleIds: ["DATA-003"],
        evidenceIds: ["E2"],
        relevance: "POSSIBLE",
        relationType: "POSSIBLE_OBLIGATION",
      }),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.relevance).toBe("RELEVANT"); // 更强者保留
    expect(collapsed[0]?.controlCodes.sort()).toEqual([
      "CTRL-DATA-ACCESS-01",
      "CTRL-PRIVACY-01",
    ]);
    expect(collapsed[0]?.supportingRuleIds.sort()).toEqual([
      "DATA-001",
      "DATA-002",
      "DATA-003",
    ]);
    expect(collapsed[0]?.evidenceIds.sort()).toEqual(["E1", "E2"]);
  });
});

describe("buildComplianceReportSections（Snapshot-only）", () => {
  it("undefined → 不插入章节（旧草稿兼容）", () => {
    expect(buildComplianceReportSections(undefined)).toEqual([]);
  });

  it("Snapshot-only：不依赖 DB；文案与免责声明正确", () => {
    const sections = buildComplianceReportSections([
      snap({ relevance: "RELEVANT" }),
      snap({
        clauseKey: "article-31",
        articleNumber: "第三十一条",
        relevance: "POSSIBLE",
        relationType: "POSSIBLE_OBLIGATION",
        controlCode: "CTRL-DATA-EXPORT-01",
      }),
      snap({
        clauseKey: "article-36",
        documentCanonicalCode: "CN-NDSL-REGULATION",
        documentTitle: "网络数据安全管理条例",
        relevance: "INSUFFICIENT_CONTEXT",
        controlCode: "CTRL-DATA-EXPORT-01",
      }),
    ]);
    expect(sections.map((s) => s.key)).toEqual([
      "complianceRelevant",
      "compliancePossible",
      "complianceFurtherVerification",
    ]);
    const text = sections.map((s) => s.content).join("\n");
    expect(text).toContain(COMPLIANCE_REPORT_DISCLAIMER);
    expect(text).toContain("存在相关性");
    expect(text).toMatch(/可能涉及/);
    expect(text).toMatch(/缺少必要上下文/);
    expect(text).not.toMatch(FORBIDDEN_COMPLIANCE_REPORT_PHRASES);
    // 正文不堆砌 ruleId
    expect(text).not.toMatch(/DATA-001/);
    expect(text).toContain("CTRL-DATA-ACCESS-01");
  });

  it("GB/T SUMMARY_ONLY 渲染为标准要求摘要，非全文原文", () => {
    const sections = buildComplianceReportSections([
      snap({
        documentCanonicalCode: "CN-GBT-22239",
        documentTitle:
          "信息安全技术 网络安全等级保护基本要求（GB/T 22239-2019）",
        versionKey: "2019",
        versionLabel: "GB/T 22239-2019",
        clauseKey: "req-access-control",
        articleNumber: null,
        clauseHeading: "访问控制（精选要求）",
        contentMode: "SUMMARY_ONLY",
        relevance: "RELEVANT",
        controlCode: "CTRL-DATA-ACCESS-01",
      }),
    ]);
    const relevant = sections.find((s) => s.key === "complianceRelevant");
    expect(relevant?.content).toMatch(/标准\/制度要求摘要|控制参考/);
    expect(relevant?.content).toMatch(/非全文原文引用/);
    expect(relevant?.content).not.toMatch(/原文规定如下/);
  });

  it("禁止自动违法/违反/已违规措辞", () => {
    const sections = buildComplianceReportSections([
      snap({ relevance: "DIRECT" }),
      snap({ relevance: "RELEVANT", clauseKey: "article-21" }),
    ]);
    const text = sections.map((s) => s.content).join("\n");
    expect(text).toContain("直接相关");
    expect(text).not.toMatch(FORBIDDEN_COMPLIANCE_REPORT_PHRASES);
  });
});

describe("Case A/B DOCX regression（pack graph Snapshot）", () => {
  function reportFor(draft: typeof caseA) {
    const securityCase = analyzeSecurityCase(draft);
    const resolved = resolveCaseComplianceFromGraph(
      {
        draft,
        analysisResults: securityCase.analysisResults,
        evidences: securityCase.evidences,
        capturedAt: CAPTURED,
      },
      graph,
    );
    return {
      securityCase,
      report: buildReportData({
        securityCase,
        humanReview: securityCase.humanReview,
        checklist: securityCase.checklist,
        timeline: securityCase.timeline,
        complianceReferences: resolved.snapshots,
      }),
      snapshots: resolved.snapshots,
    };
  }

  it("Case A/B：合规章节存在且 deterministic；DOCX 可生成", async () => {
    const a1 = reportFor(caseA);
    const a2 = reportFor(caseA);
    expect(a1.report.complianceReferences).toEqual(a2.report.complianceReferences);
    const aCompliance = a1.report.sections
      .filter((s) => s.key.startsWith("compliance"))
      .map((s) => ({ key: s.key, content: s.content }));
    const aCompliance2 = a2.report.sections
      .filter((s) => s.key.startsWith("compliance"))
      .map((s) => ({ key: s.key, content: s.content }));
    expect(aCompliance).toEqual(aCompliance2);

    expect(a1.report.sections.some((s) => s.key === "complianceRelevant")).toBe(
      true,
    );
    // 分层 topN 后 Case A 三节均应有实质条目（非空态提示）
    const aPossible = a1.report.sections.find((s) => s.key === "compliancePossible");
    const aInsufficient = a1.report.sections.find(
      (s) => s.key === "complianceFurtherVerification",
    );
    expect(aPossible?.content).toMatch(/可能涉及/);
    expect(aInsufficient?.content).toMatch(/缺少必要上下文/);
    const aText = a1.report.sections.map((s) => s.content).join("\n");
    expect(aText).not.toMatch(FORBIDDEN_COMPLIANCE_REPORT_PHRASES);
    // 三态正文章节仍在
    expect(a1.report.sections.some((s) => s.key === "dataAnalysis")).toBe(true);
    expect(a1.report.sections.some((s) => s.key === "conclusion")).toBe(true);

    const b = reportFor(caseB);
    expect(b.snapshots.length).toBeGreaterThan(0);
    expect(b.report.sections.filter((s) => s.key.startsWith("compliance"))).toHaveLength(
      3,
    );
    const bText = b.report.sections.map((s) => s.content).join("\n");
    expect(bText).toContain(COMPLIANCE_REPORT_DISCLAIMER);
    expect(bText).not.toMatch(FORBIDDEN_COMPLIANCE_REPORT_PHRASES);

    // GB/T 出现时必须是摘要措辞
    if (bText.includes("GB/T 22239") || bText.includes("等级保护")) {
      expect(bText).toMatch(/摘要|控制参考/);
    }

    const specA = buildDocxSpec(a1.report, {
      evidences: a1.securityCase.evidences,
      timeline: a1.securityCase.timeline,
    });
    expect(specA.blocks.some((b) => b.kind === "heading" && b.text === "相关合规参考")).toBe(
      true,
    );

    const bufA = await generateDocxBuffer(a1.report, {
      evidences: a1.securityCase.evidences,
      timeline: a1.securityCase.timeline,
    });
    const bufB = await generateDocxBuffer(b.report, {
      evidences: b.securityCase.evidences,
      timeline: b.securityCase.timeline,
    });
    expect(bufA.byteLength).toBeGreaterThan(1000);
    expect(bufB.byteLength).toBeGreaterThan(1000);
  });

  it("buildReportData 不传入 Snapshot 时保持旧章节集合（无合规三节）", () => {
    const securityCase = analyzeSecurityCase(caseA);
    const report = buildReportData({
      securityCase,
      humanReview: securityCase.humanReview,
      checklist: securityCase.checklist,
      timeline: securityCase.timeline,
    });
    expect(report.sections.some((s) => s.key.startsWith("compliance"))).toBe(
      false,
    );
    expect(report.complianceReferences).toBeUndefined();
  });
});
