import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildCaseCompliancePanelView } from "@/services/knowledge/caseCompliancePanel";
import {
  COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE,
  resolveComplianceSourceNavigation,
  sanitizeOfficialSourceUrl,
} from "@/services/knowledge/complianceSourceNavigation";
import { CASE_UI_COMPLIANCE_TOP_N } from "@/services/knowledge/caseCompliancePanel";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { resolveCaseComplianceFromGraph } from "@/services/knowledge/resolveCaseCompliance";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("sanitizeOfficialSourceUrl", () => {
  it("接受已批准官方 https 链接", () => {
    expect(sanitizeOfficialSourceUrl("https://www.npc.gov.cn/")).toBe(
      "https://www.npc.gov.cn/",
    );
    expect(sanitizeOfficialSourceUrl("https://www.gov.cn/")).toContain(
      "gov.cn",
    );
    expect(sanitizeOfficialSourceUrl("https://openstd.samr.gov.cn/")).toContain(
      "openstd.samr.gov.cn",
    );
  });

  it("拒绝非法协议、未批准域名与凭据", () => {
    expect(sanitizeOfficialSourceUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeOfficialSourceUrl("file:///tmp/law.pdf")).toBeNull();
    expect(sanitizeOfficialSourceUrl("https://evil.example.com/npc")).toBeNull();
    expect(
      sanitizeOfficialSourceUrl("https://user:pass@www.npc.gov.cn/"),
    ).toBeNull();
    expect(sanitizeOfficialSourceUrl("not a url")).toBeNull();
    expect(sanitizeOfficialSourceUrl(null)).toBeNull();
    expect(sanitizeOfficialSourceUrl("")).toBeNull();
  });

  it("保留 pack 自带 hash，不伪造锚点", () => {
    const withHash = sanitizeOfficialSourceUrl(
      "https://www.npc.gov.cn/npc/c2/c3/#article-21",
    );
    expect(withHash).toContain("#article-21");
  });
});

describe("resolveComplianceSourceNavigation", () => {
  it("官方文档页可用时提供查看官方来源", () => {
    const nav = resolveComplianceSourceNavigation({
      sourceUrl: "https://www.npc.gov.cn/",
      contentMode: "FULL_TEXT",
      documentCanonicalCode: "CN-DSL",
    });
    expect(nav.available).toBe(true);
    expect(nav.href).toBe("https://www.npc.gov.cn/");
    expect(nav.targetKind).toBe("DOCUMENT_PAGE");
    expect(nav.actionLabel).toBe("查看官方来源");
    expect(nav.allowsOriginalClauseView).toBe(true);
  });

  it("无 source 时空态，不抛错", () => {
    const nav = resolveComplianceSourceNavigation({
      sourceUrl: null,
      contentMode: "FULL_TEXT",
      documentCanonicalCode: "CN-DSL",
    });
    expect(nav.available).toBe(false);
    expect(nav.href).toBeNull();
    expect(nav.emptyMessage).toBe(COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE);
  });

  it("非法 URL 视为无可用来源", () => {
    const nav = resolveComplianceSourceNavigation({
      sourceUrl: "https://malware.test/law",
      contentMode: "FULL_TEXT",
      documentCanonicalCode: "CN-DSL",
    });
    expect(nav.available).toBe(false);
    expect(nav.href).toBeNull();
  });

  it("GB/T SUMMARY_ONLY：可跳官方元数据页，不允许原文条款入口", () => {
    const nav = resolveComplianceSourceNavigation({
      sourceUrl: "https://openstd.samr.gov.cn/",
      contentMode: "SUMMARY_ONLY",
      documentCanonicalCode: "CN-GBT-22239",
    });
    expect(nav.available).toBe(true);
    expect(nav.href).toContain("openstd.samr.gov.cn");
    expect(nav.allowsOriginalClauseView).toBe(false);
    expect(nav.actionLabel).toBe("查看官方来源");
  });

  it("仅当 pack 提供含稳定锚点的条款 URL 时才用 CLAUSE_ANCHOR；不伪造", () => {
    const noFake = resolveComplianceSourceNavigation({
      sourceUrl: "https://www.npc.gov.cn/",
      contentMode: "FULL_TEXT",
      documentCanonicalCode: "CN-CSL",
      clauseSourceUrl: null,
    });
    expect(noFake.targetKind).toBe("DOCUMENT_PAGE");
    expect(noFake.href).not.toMatch(/#/);

    const withAnchor = resolveComplianceSourceNavigation({
      sourceUrl: "https://www.npc.gov.cn/",
      contentMode: "FULL_TEXT",
      documentCanonicalCode: "CN-CSL",
      clauseSourceUrl: "https://www.npc.gov.cn/path/#article-21",
    });
    expect(withAnchor.targetKind).toBe("CLAUSE_ANCHOR");
    expect(withAnchor.href).toContain("#article-21");

    // SUMMARY_ONLY 即使给了条款锚点也不升级为原文条款导航
    const summary = resolveComplianceSourceNavigation({
      sourceUrl: "https://openstd.samr.gov.cn/",
      contentMode: "SUMMARY_ONLY",
      documentCanonicalCode: "CN-GBT-22239",
      clauseSourceUrl: "https://openstd.samr.gov.cn/x/#req",
    });
    expect(summary.targetKind).toBe("DOCUMENT_PAGE");
    expect(summary.allowsOriginalClauseView).toBe(false);
  });
});

describe("Case A/B official source regression", () => {
  const graph = curatedPackToResolutionGraph();

  function panelFor(draft: typeof caseA) {
    const analyzed = analyzeSecurityCase(draft);
    const resolved = resolveCaseComplianceFromGraph(
      {
        draft,
        analysisResults: analyzed.analysisResults,
        evidences: analyzed.evidences,
        capturedAt: "2026-08-09T12:00:00.000Z",
        topN: CASE_UI_COMPLIANCE_TOP_N,
      },
      graph,
    );
    return buildCaseCompliancePanelView(resolved.snapshots, resolved.findings);
  }

  it("Case A/B：条目含版本/机关信息，官方链接来自 pack 且经校验", () => {
    for (const draft of [caseA, caseB]) {
      const view = panelFor(draft);
      expect(view.empty).toBe(false);
      for (const item of view.groups.flatMap((g) => g.items)) {
        expect(item.documentCanonicalCode.length).toBeGreaterThan(0);
        expect(item.versionKey.length).toBeGreaterThan(0);
        expect(item.versionLabel.length).toBeGreaterThan(0);
        expect(item.issuingAuthority).toBeTruthy();
        expect(item.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(item.officialSource.actionLabel).toBe("查看官方来源");
        if (item.officialSource.available) {
          expect(item.officialSource.href).toMatch(/^https:\/\//);
          expect(
            sanitizeOfficialSourceUrl(item.officialSource.href),
          ).toBeTruthy();
        } else {
          expect(item.officialSource.emptyMessage).toBe(
            COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE,
          );
        }
        if (item.isSummaryOnly || item.documentCanonicalCode.startsWith("CN-GBT-")) {
          expect(item.officialSource.allowsOriginalClauseView).toBe(false);
        }
      }
    }
  });
});

describe("CaseCompliancePanel 官方来源 UI 契约", () => {
  const src = readFileSync(
    path.resolve(import.meta.dirname, "../../../components/cases/CaseCompliancePanel.tsx"),
    "utf8",
  );

  it("展开区含查看官方来源、noopener、空态文案；无硬编码法规站外域名拼装", () => {
    expect(src).toContain("查看官方来源");
    expect(src).toContain("noopener noreferrer");
    expect(src).toContain("暂无可用官方来源链接");
    expect(src).toContain("发布机关");
    expect(src).toContain("生效日期");
    expect(src).toContain("来源权威性");
    expect(src).toContain("不提供原文条款跳转");
    expect(src).not.toContain("https://www.npc.gov.cn");
    expect(src).not.toContain("docs/law/");
  });
});
