/**
 * Step 5：合规建议核查清单视图测试。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type { CaseComplianceFinding } from "@/domain/knowledge";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  CASE_COMPLIANCE_CHECKLIST_DISCLAIMER,
  CASE_UI_COMPLIANCE_CHECKLIST_TOP_N,
  FORBIDDEN_CASE_COMPLIANCE_CHECKLIST_PHRASES,
  buildCaseComplianceChecklistView,
  emptyCaseComplianceChecklistView,
  scoreComplianceChecklistCandidate,
  selectTopComplianceChecklistItems,
} from "@/services/knowledge/caseComplianceChecklist";
import { CASE_UI_COMPLIANCE_TOP_N } from "@/services/knowledge/caseCompliancePanel";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { resolveCaseComplianceFromGraph } from "@/services/knowledge/resolveCaseCompliance";

const graph = curatedPackToResolutionGraph();

function finding(
  overrides: Partial<CaseComplianceFinding> &
    Pick<
      CaseComplianceFinding,
      "controlCode" | "clauseKey" | "relevance" | "relationType"
    >,
): CaseComplianceFinding {
  return {
    ruleId: overrides.ruleId ?? "DATA-001",
    supportingRuleIds: overrides.supportingRuleIds ?? [],
    evidenceIds: overrides.evidenceIds ?? [],
    controlId: overrides.controlCode,
    controlCode: overrides.controlCode,
    documentId: "doc",
    documentCanonicalCode: overrides.documentCanonicalCode ?? "CN-DSL",
    documentVersionId: "ver",
    versionKey: "2021-original",
    clauseId: overrides.clauseKey,
    clauseKey: overrides.clauseKey,
    relationType: overrides.relationType,
    relevance: overrides.relevance,
    rationale: "test",
    missingContext: overrides.missingContext ?? [],
    suggestedEvidence: overrides.suggestedEvidence ?? [],
    suggestedChecklist: overrides.suggestedChecklist ?? [],
    versionSelectionBasis: "CASE_DATE",
    caseDate: "2026-08-08",
  };
}

function resolveChecklist(draft: typeof caseA) {
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
  return {
    resolved,
    view: buildCaseComplianceChecklistView(resolved.allFindings),
  };
}

describe("scoreComplianceChecklistCandidate", () => {
  it("INSUFFICIENT_CONTEXT 的 CONTEXT 优先于 CONTROL_SUPPORT 核查动作", () => {
    const high = scoreComplianceChecklistCandidate({
      kind: "CONTEXT",
      relevance: "INSUFFICIENT_CONTEXT",
      relationType: "CONTROL_SUPPORT",
    });
    const mid = scoreComplianceChecklistCandidate({
      kind: "CHECKLIST",
      relevance: "POSSIBLE",
      relationType: "POSSIBLE_OBLIGATION",
    });
    const low = scoreComplianceChecklistCandidate({
      kind: "CHECKLIST",
      relevance: "RELEVANT",
      relationType: "CONTROL_SUPPORT",
    });
    expect(high).toBeLessThan(mid);
    expect(mid).toBeLessThan(low);
  });

  it("ESCALATION_TRIGGER 优先于普通 CONTROL_SUPPORT", () => {
    const esc = scoreComplianceChecklistCandidate({
      kind: "CHECKLIST",
      relevance: "RELEVANT",
      relationType: "ESCALATION_TRIGGER",
    });
    const support = scoreComplianceChecklistCandidate({
      kind: "CHECKLIST",
      relevance: "RELEVANT",
      relationType: "CONTROL_SUPPORT",
    });
    expect(esc).toBeLessThan(support);
  });
});

describe("buildCaseComplianceChecklistView", () => {
  it("空 findings → 空态", () => {
    expect(buildCaseComplianceChecklistView([])).toEqual(
      emptyCaseComplianceChecklistView(),
    );
  });

  it("多 finding 相同 key 去重，并合并 provenance", () => {
    const view = buildCaseComplianceChecklistView([
      finding({
        controlCode: "CTRL-A",
        clauseKey: "article-27",
        relevance: "RELEVANT",
        relationType: "CONTROL_SUPPORT",
        suggestedChecklist: [
          { key: "verify-ticket", label: "核查是否存在对应变更/计划任务工单" },
        ],
        ruleId: "DATA-001",
        evidenceIds: ["e1"],
      }),
      finding({
        controlCode: "CTRL-B",
        clauseKey: "article-31",
        documentCanonicalCode: "CN-DSL",
        relevance: "INSUFFICIENT_CONTEXT",
        relationType: "POSSIBLE_OBLIGATION",
        suggestedChecklist: [
          { key: "verify-ticket", label: "核查是否存在对应变更/计划任务工单" },
        ],
        ruleId: "DATA-002",
        supportingRuleIds: ["NETWORK-002"],
        evidenceIds: ["e2"],
      }),
    ]);
    const all = view.groups.flatMap((g) => g.items);
    const tickets = all.filter((i) => i.sourceKey === "verify-ticket");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.controlCodes).toEqual(["CTRL-A", "CTRL-B"]);
    expect(tickets[0]!.clauseRefs.map((r) => r.clauseKey).sort()).toEqual([
      "article-27",
      "article-31",
    ]);
    expect(tickets[0]!.ruleIds).toEqual(["DATA-001", "DATA-002", "NETWORK-002"]);
    expect(tickets[0]!.evidenceIds).toEqual(["e1", "e2"]);
  });

  it("INSUFFICIENT_CONTEXT ContextRequirement 排在前列", () => {
    const view = buildCaseComplianceChecklistView(
      [
        finding({
          controlCode: "CTRL-SUPPORT",
          clauseKey: "article-1",
          relevance: "RELEVANT",
          relationType: "CONTROL_SUPPORT",
          suggestedChecklist: [
            { key: "verify-owner", label: "联系业务负责人核实业务合理性" },
          ],
        }),
        finding({
          controlCode: "CTRL-EXPORT",
          clauseKey: "article-31",
          relevance: "INSUFFICIENT_CONTEXT",
          relationType: "POSSIBLE_OBLIGATION",
          missingContext: [
            { key: "destinationRegion", label: "数据去向/目的地区域" },
          ],
        }),
      ],
      8,
    );
    const flat = view.groups.flatMap((g) => g.items);
    expect(flat[0]!.kind).toBe("CONTEXT");
    expect(flat[0]!.sourceKey).toBe("destinationRegion");
  });

  it("聚合 EvidenceSuggestion 与 ChecklistSuggestion；空组不出现", () => {
    const view = buildCaseComplianceChecklistView([
      finding({
        controlCode: "CTRL-X",
        clauseKey: "c1",
        relevance: "RELEVANT",
        relationType: "CONTROL_SUPPORT",
        suggestedEvidence: [
          { key: "db-audit", label: "数据库审计日志（脱敏）" },
        ],
        suggestedChecklist: [
          { key: "verify-export", label: "确认数据是否被导出及去向" },
        ],
      }),
    ]);
    expect(view.groups.map((g) => g.kind)).toEqual(["EVIDENCE", "CHECKLIST"]);
    expect(view.groups.some((g) => g.kind === "CONTEXT")).toBe(false);
    expect(view.groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("Top-N 稳定且不超过上限；分层保证各非空 kind 有代表", () => {
    const findings = Array.from({ length: 6 }, (_, i) =>
      finding({
        controlCode: `CTRL-${i}`,
        clauseKey: `c-${i}`,
        relevance: "RELEVANT",
        relationType: "CONTROL_SUPPORT",
        missingContext:
          i < 2 ? [{ key: `ctx-${i}`, label: `上下文${i}` }] : [],
        suggestedEvidence:
          i >= 2 && i < 4 ? [{ key: `ev-${i}`, label: `证据${i}` }] : [],
        suggestedChecklist:
          i >= 4 ? [{ key: `cl-${i}`, label: `动作${i}` }] : [],
      }),
    );
    const view = buildCaseComplianceChecklistView(findings, 5);
    expect(view.totalCount).toBe(5);
    const kinds = new Set(view.groups.map((g) => g.kind));
    expect(kinds.has("CONTEXT")).toBe(true);
    expect(kinds.has("EVIDENCE")).toBe(true);
    expect(kinds.has("CHECKLIST")).toBe(true);
    const again = buildCaseComplianceChecklistView(findings, 5);
    expect(again.groups.flatMap((g) => g.items.map((i) => i.key))).toEqual(
      view.groups.flatMap((g) => g.items.map((i) => i.key)),
    );
    // selectTop 自身也稳定
    const flat = buildCaseComplianceChecklistView(findings, 100).groups.flatMap(
      (g) => g.items,
    );
    expect(selectTopComplianceChecklistItems(flat, 5).map((i) => i.key)).toEqual(
      selectTopComplianceChecklistItems(flat, 5).map((i) => i.key),
    );
  });

  it("禁止措辞扫描：文案与免责声明", () => {
    const { view } = resolveChecklist(caseA);
    const blob = [
      CASE_COMPLIANCE_CHECKLIST_DISCLAIMER,
      ...view.groups.flatMap((g) => [
        g.title,
        ...g.items.map((i) => i.label),
      ]),
    ].join("\n");
    expect(blob).not.toMatch(FORBIDDEN_CASE_COMPLIANCE_CHECKLIST_PHRASES);
    expect(blob).toContain("不构成违法认定");
  });
});

describe("Case A/B checklist regression", () => {
  it("Case A：优先含授权工单、业务核实、数据去向类核查", () => {
    const { view } = resolveChecklist(caseA);
    expect(view.empty).toBe(false);
    expect(view.totalCount).toBeLessThanOrEqual(
      CASE_UI_COMPLIANCE_CHECKLIST_TOP_N,
    );
    const labels = view.groups
      .flatMap((g) => g.items.map((i) => i.label))
      .join("\n");
    const keys = new Set(
      view.groups.flatMap((g) => g.items.map((i) => i.sourceKey)),
    );
    expect(
      keys.has("verify-ticket") ||
        keys.has("changeTicketId") ||
        keys.has("change-ticket") ||
        labels.includes("授权工单") ||
        labels.includes("工单"),
    ).toBe(true);
    expect(keys.has("verify-owner") || labels.includes("业务")).toBe(true);
    expect(
      keys.has("destinationRegion") ||
        keys.has("verify-export") ||
        labels.includes("去向"),
    ).toBe(true);
  });

  it("Case B：优先含使用人/权限、导出去向、日志保全、事件响应类核查", () => {
    const { view } = resolveChecklist(caseB);
    expect(view.empty).toBe(false);
    const keys = new Set(
      view.groups.flatMap((g) => g.items.map((i) => i.sourceKey)),
    );
    const labels = view.groups
      .flatMap((g) => g.items.map((i) => i.label))
      .join("\n");
    expect(
      keys.has("verify-account") ||
        keys.has("accountName") ||
        labels.includes("使用人") ||
        labels.includes("账号"),
    ).toBe(true);
    expect(
      keys.has("verify-export") ||
        keys.has("destinationRegion") ||
        labels.includes("去向") ||
        labels.includes("导出"),
    ).toBe(true);
    expect(
      keys.has("db-audit") ||
        keys.has("auth-log") ||
        keys.has("gateway-log") ||
        labels.includes("日志"),
    ).toBe(true);
    expect(
      keys.has("escalate-ir") ||
        keys.has("verify-ticket") ||
        keys.has("changeTicketId") ||
        labels.includes("事件响应") ||
        labels.includes("工单"),
    ).toBe(true);
  });
});

describe("CaseComplianceChecklistPanel UI 契约", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const panel = readFileSync(
    path.join(root, "components/cases/CaseComplianceChecklistPanel.tsx"),
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

  it("默认折叠依据；ruleId 仅在二级技术详情；空态文案存在", () => {
    expect(panel).toContain("当前暂无额外合规核查事项");
    expect(panel).toContain("依据");
    expect(panel).toContain("{open &&");
    expect(panel).toContain("技术详情");
    expect(panel).not.toContain("审计信息");
    expect(panel).not.toContain("supportingRuleIds：");
    const beforeTech = panel.split("技术详情")[0] ?? "";
    expect(beforeTech).not.toContain("{item.ruleIds");
    expect(panel).not.toMatch(/必须认定违法|已构成违规|责任成立/);
  });

  it("工作台接入建议视图与加入清单；页面一次 load 双视图", () => {
    expect(workbench).toContain("CaseComplianceChecklistPanel");
    expect(workbench).toContain("complianceChecklist");
    expect(workbench).toContain("handleAddComplianceSuggestion");
    expect(workbench).toContain("canWriteChecklist");
    expect(workbench).not.toContain("resolveCaseCompliance");
    expect(page).toContain("loadCaseDetailPageData");
    expect(page).toContain(
      "complianceChecklist={runtimeViews.compliance.checklist}",
    );
    expect(panel).toContain("加入核查清单");
    expect(panel).toContain("已加入");
  });
});
