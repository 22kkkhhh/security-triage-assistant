/**
 * v1.5 M3 Workstream B：Investigation Progress UI 契约。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  businessContextFieldNeedsAttention,
} from "@/components/BusinessContextPanel";
import {
  countBusinessContextPendingFields,
  countComplianceKind,
  summarizeInvestigationProgress,
} from "@/components/cases/investigationProgressSummary";
import type { BusinessContext, ChecklistItem } from "@/domain/types";
import { caseA, caseB } from "@/domain/demo";
import type { CaseComplianceChecklistView } from "@/services/knowledge/caseComplianceChecklist";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

const emptyCompliance: CaseComplianceChecklistView = {
  groups: [],
  totalCount: 0,
  empty: true,
};

function complianceView(
  kinds: Partial<Record<"CONTEXT" | "EVIDENCE" | "CHECKLIST", number>>,
): CaseComplianceChecklistView {
  const groups = (
    ["CONTEXT", "EVIDENCE", "CHECKLIST"] as const
  )
    .filter((kind) => (kinds[kind] ?? 0) > 0)
    .map((kind) => ({
      kind,
      title:
        kind === "CONTEXT"
          ? "待补充上下文"
          : kind === "EVIDENCE"
            ? "待收集证据"
            : "建议核查项",
      items: Array.from({ length: kinds[kind] ?? 0 }, (_, i) => ({
        key: `${kind}:k${i}`,
        sourceKey: `k${i}`,
        label: `${kind}-${i}`,
        kind,
        priority: i,
        controlCodes: [],
        clauseRefs: [],
        relevance: "POSSIBLE" as const,
        relationTypes: [],
        ruleIds: [],
        supportingRuleIds: [],
        evidenceIds: [],
      })),
    }));
  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
  return { groups, totalCount, empty: totalCount === 0 };
}

function checklistItems(
  specs: Array<{ id: string; completed: boolean }>,
): ChecklistItem[] {
  return specs.map((s) => ({
    id: s.id,
    category: "BUSINESS",
    label: s.id,
    completed: s.completed,
    note: null,
    origin: "MANUAL",
    relatedRuleId: null,
  }));
}

const sparseBc: BusinessContext = {
  plannedTaskStatus: "UNKNOWN",
  changeTicketStatus: "UNKNOWN",
  changeTicketId: null,
  businessOwner: null,
  ownerVerification: "UNKNOWN",
  businessLegitimacy: "UNKNOWN",
  businessJustification: null,
};

describe("investigation progress counts（可靠现有数据）", () => {
  it("待补 Context：BC 字段待补充 + 合规 CONTEXT 建议", () => {
    const counts = summarizeInvestigationProgress({
      businessContext: sparseBc,
      checklist: [],
      complianceChecklist: complianceView({ CONTEXT: 2 }),
    });
    expect(counts.pendingBusinessContextFields).toBe(
      countBusinessContextPendingFields(sparseBc),
    );
    expect(counts.pendingContextSuggestions).toBe(2);
    expect(counts.pendingContext).toBe(
      counts.pendingBusinessContextFields + 2,
    );
    expect(counts.pendingContext).toBeGreaterThan(0);
  });

  it("待 Evidence：仅统计合规 EVIDENCE 建议", () => {
    const counts = summarizeInvestigationProgress({
      businessContext: caseA.businessContext,
      checklist: [],
      complianceChecklist: complianceView({ EVIDENCE: 1, CONTEXT: 3 }),
    });
    expect(counts.pendingEvidence).toBe(1);
    expect(countComplianceKind(complianceView({ EVIDENCE: 1 }), "EVIDENCE")).toBe(
      1,
    );
  });

  it("Checklist incomplete / complete presentation", () => {
    const counts = summarizeInvestigationProgress({
      businessContext: caseA.businessContext,
      checklist: checklistItems([
        { id: "a", completed: false },
        { id: "b", completed: true },
        { id: "c", completed: false },
      ]),
      complianceChecklist: emptyCompliance,
    });
    expect(counts.pendingChecks).toBe(2);
    expect(counts.completedChecks).toBe(1);
  });

  it("UNKNOWN 不显示成已解决：ownerVerification=UNKNOWN 计入待补，不计入已完成", () => {
    expect(
      businessContextFieldNeedsAttention("ownerVerification", sparseBc),
    ).toBe(true);
    const counts = summarizeInvestigationProgress({
      businessContext: sparseBc,
      checklist: checklistItems([{ id: "x", completed: true }]),
      complianceChecklist: emptyCompliance,
    });
    expect(counts.pendingBusinessContextFields).toBeGreaterThan(0);
    expect(counts.pendingContext).toBeGreaterThan(0);
    expect(counts.completedChecks).toBe(1);
    expect(counts.hasOutstandingWork).toBe(true);
  });

  it("Case A/B：可产生稳定汇总且无最终结论推导字段", () => {
    for (const draft of [caseA, caseB]) {
      const counts = summarizeInvestigationProgress({
        businessContext: draft.businessContext,
        checklist: [],
        complianceChecklist: emptyCompliance,
      });
      expect(counts).toHaveProperty("pendingContext");
      expect(counts).toHaveProperty("pendingEvidence");
      expect(counts).toHaveProperty("pendingChecks");
      expect(counts).toHaveProperty("completedChecks");
      expect(counts).not.toHaveProperty("finalConclusion");
      expect(counts).not.toHaveProperty("resolved");
      // Case A/B 的 ownerVerification 等字段状态不得被当成已解决
      if (draft.businessContext.ownerVerification === "UNKNOWN") {
        expect(counts.pendingBusinessContextFields).toBeGreaterThan(0);
        expect(counts.completedChecks).toBe(0);
      }
    }
  });
});

describe("Investigation Progress UI 契约", () => {
  const panel = readSrc("components/cases/InvestigationProgressPanel.tsx");
  const summary = readSrc("components/cases/investigationProgressSummary.ts");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const humanReview = readSrc("components/HumanReviewPanel.tsx");
  const bcPanel = readSrc("components/BusinessContextPanel.tsx");

  it("展示四类汇总文案", () => {
    expect(panel).toContain("调查进度");
    expect(panel).toContain("待补充上下文");
    expect(panel).toContain("待收集证据");
    expect(panel).toContain("待完成核查");
    expect(panel).toContain("已完成");
    expect(panel).toContain("非最终结论");
  });

  it("不实现 backend progress resolver / 不导入 Prisma / compliance runtime", () => {
    expect(summary).not.toContain("resolveInvestigationProgress");
    expect(summary).not.toContain("resolveCaseCompliance");
    expect(summary).not.toContain("@/lib/prisma");
    expect(summary).not.toContain("@/generated/prisma");
    expect(panel).not.toContain("resolveCaseCompliance");
    expect(workbench).not.toContain("resolveCaseCompliance");
  });

  it("Workbench 最小 glue：进度面板 + 锚点 + HumanReview 提示", () => {
    expect(workbench).toContain("<InvestigationProgressPanel");
    expect(workbench).toContain("summarizeInvestigationProgress");
    expect(workbench).toContain("INVESTIGATION_SECTION_IDS");
    expect(workbench).toContain("outstandingWorkHint={investigationProgress.hasOutstandingWork}");
    expect(workbench).toContain("INVESTIGATION_SECTION_IDS.businessContext");
    expect(workbench).toContain("INVESTIGATION_SECTION_IDS.checklist");
    expect(workbench).toContain("INVESTIGATION_SECTION_IDS.evidence");
    expect(workbench).toContain("INVESTIGATION_SECTION_IDS.humanReview");
  });

  it("HumanReview：提示不 hard-block，仍由人工控制", () => {
    expect(humanReview).toContain("outstandingWorkHint");
    expect(humanReview).toContain(
      "当前仍有待核查事项，请结合现有证据完成人工研判。",
    );
    expect(humanReview).toContain("不阻止提交");
    expect(humanReview).toContain("canWriteSemantic");
    expect(humanReview).not.toMatch(/disabled=\{outstandingWorkHint\}/);
    expect(humanReview).not.toMatch(/if \(outstandingWorkHint\) return/);
  });

  it("VIEWER readonly：写权限仍由 capability 控制", () => {
    expect(workbench).toContain("canWriteBusinessContext");
    expect(workbench).toContain("canWriteHumanReview");
    expect(workbench).toContain("canWriteChecklist");
    expect(workbench).toContain(
      "if (structured && !capabilities.canWriteHumanReview) return;",
    );
  });

  it("M1 router.refresh regression", () => {
    expect(workbench).toContain("router.refresh()");
    expect(workbench).toContain("refreshComplianceAfterContextPersist");
  });

  it("M2 BusinessContext UI regression", () => {
    expect(bcPanel).toContain("待补充");
    expect(bcPanel).toContain("任务与变更");
    expect(bcPanel).toContain("saveState");
    expect(workbench).toContain("saveState={saveState}");
    expect(workbench).toContain("onRetrySave={retrySave}");
  });
});
