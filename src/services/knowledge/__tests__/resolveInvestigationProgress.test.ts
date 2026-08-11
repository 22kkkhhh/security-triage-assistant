/**
 * v1.5 Milestone 3 Workstream A：Investigation Progress Service 测试。
 */
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { resolveInvestigationContext } from "@/services/knowledge/resolveInvestigationContext";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { refreshCaseComplianceRuntimeFromGraph } from "@/services/knowledge/refreshCaseComplianceRuntime";
import { resolveCaseComplianceFromGraph } from "@/services/knowledge/resolveCaseCompliance";
import { loadInvestigationProgress } from "@/services/knowledge/resolveInvestigationProgress";
import type { ComplianceReferenceSnapshot } from "@/domain/knowledge";
import type { SecurityCaseDraft } from "@/domain/types";

const packGraph = curatedPackToResolutionGraph();

function toRecord(draft: SecurityCaseDraft) {
  const analyzed = analyzeSecurityCase(draft);
  return {
    id: draft.id,
    caseNumber: "TEST-001",
    title: draft.name,
    status: "INVESTIGATING" as const,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    humanRiskLevel: null,
    humanConclusion: null,
    username: draft.identityContext.accountName,
    sourceIp: draft.identityContext.loginSourceIp,
    systemsSearchText: draft.identityContext.accessedSystems.join(" "),
    pendingChecklistCount: 0,
    hasReport: false,
    reportUpdatedAt: null,
    lastActivityAt: "2026-08-09T12:00:00.000Z",
    ownership: {
      assignedToUserId: null,
      assignedAt: null,
      assignee: null,
    },
    dueAt: null,
    caseState: {
      caseData: {
        name: draft.name,
        createdAt: draft.createdAt,
        alert: draft.alert,
        dataContext: draft.dataContext,
        networkContext: draft.networkContext,
        identityContext: draft.identityContext,
      },
      businessContext: draft.businessContext,
      checklist: analyzed.checklist,
      humanReview: draft.humanReview,
      timeline: draft.timeline,
    },
    reportDraft: null,
    createdAt: draft.createdAt,
    updatedAt: "2026-08-09T12:00:00.000Z",
    closedAt: null,
  };
}

describe("loadInvestigationProgress service contract", () => {
  it("Case A/B regression：progress 可解析且含 context / checklist", () => {
    const progressA = loadInvestigationProgress(analyzeSecurityCase(caseA));
    expect(progressA.contextItems.length).toBeGreaterThan(0);
    expect(progressA.summary.resolvedCount).toBeGreaterThan(0);

    const progressB = loadInvestigationProgress(analyzeSecurityCase(caseB));
    expect(progressB.summary.openContextCount).toBeGreaterThan(0);
    expect(progressB.summary.openChecklistCount).toBeGreaterThan(0);
  });

  it("M2 Catalog regression：context OPEN 与 catalog MISSING/UNKNOWN 对齐", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const catalog = resolveInvestigationContext(caseB);
    const progress = loadInvestigationProgress(analyzed);

    const openContextKeys = progress.contextItems
      .filter((i) => i.status === "OPEN")
      .map((i) => i.key.replace("context:", ""));

    for (const key of catalog.missingKeys) {
      expect(openContextKeys).toContain(key);
    }
    for (const key of catalog.unknownKeys) {
      expect(openContextKeys).toContain(key);
    }
  });

  it("M1 refresh regression：compliance findings 可注入 evidence progress", () => {
    const record = toRecord(caseB);
    const refreshed = refreshCaseComplianceRuntimeFromGraph(record, packGraph, {
      capturedAt: "2026-08-09T12:00:00.000Z",
    });
    const analyzed = analyzeSecurityCase(caseB);
    const resolved = resolveCaseComplianceFromGraph(
      {
        draft: caseB,
        analysisResults: analyzed.analysisResults,
        evidences: analyzed.evidences,
        capturedAt: "2026-08-09T12:00:00.000Z",
      },
      packGraph,
    );
    const progress = loadInvestigationProgress(analyzed, {
      complianceFindings: resolved.allFindings,
    });

    expect(progress.evidenceItems.length).toBeGreaterThan(0);
    expect(refreshed.views.panel.totalCount).toBeGreaterThan(0);
  });

  it("frozen Report 不受影响：progress 为只读投影", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const frozenSnapshot: ComplianceReferenceSnapshot = {
      documentId: "doc-1",
      documentVersionId: "ver-1",
      documentCanonicalCode: "PIPL",
      documentTitle: "个人信息保护法",
      versionKey: "2021",
      versionLabel: "2021 施行",
      clauseId: "clause-1",
      clauseKey: "PIPL-38",
      articleNumber: null,
      clauseHeading: null,
      relationType: "CONTROL_SUPPORT",
      rationaleSnapshot: "frozen snapshot",
      sourceUrl: null,
      issuingAuthority: null,
      effectiveDate: null,
      sourceType: null,
      capturedAt: "2026-08-08T00:00:00+08:00",
      caseDate: "2026-08-08",
      versionSelectionBasis: "CASE_DATE",
      controlId: "ctrl-1",
      controlCode: "CTRL-DATA-001",
      ruleId: "RULE-DATA-001",
      supportingRuleIds: [],
      evidenceIds: [],
      relevance: "RELEVANT",
      contentMode: "SUMMARY_ONLY",
    };

    const withReport = {
      ...analyzed,
      report: {
        title: "Frozen",
        caseNumber: "INC-001",
        basicInfo: [],
        sections: [],
        evidenceIds: [],
        timelineEventIds: [],
        generatedAt: "2026-08-08T00:00:00+08:00",
        complianceReferences: [frozenSnapshot],
      },
    };
    loadInvestigationProgress(withReport);
    expect(withReport.report?.complianceReferences).toHaveLength(1);
    expect(withReport.report?.complianceReferences?.[0]?.rationaleSnapshot).toBe(
      "frozen snapshot",
    );
  });

  it("ContextRequirement compatibility：补齐 context 后 relevance 相关 OPEN 减少", () => {
    const sparse = analyzeSecurityCase({
      ...caseB,
      businessContext: {
        ...caseB.businessContext,
        changeTicketId: "CHG-TEST-001",
        businessOwner: "张演示",
        ownerVerification: "CONFIRMED",
        businessJustification: "已核实授权说明",
      },
    });

    const before = loadInvestigationProgress(analyzeSecurityCase(caseB));
    const after = loadInvestigationProgress(sparse);

    expect(after.summary.openContextCount).toBeLessThan(
      before.summary.openContextCount,
    );
    expect(
      after.contextItems.find((i) => i.key === "context:changeTicketId")?.status,
    ).toBe("RESOLVED");
  });

  it("deterministic service output", () => {
    const analyzed = analyzeSecurityCase(caseB);
    expect(loadInvestigationProgress(analyzed)).toEqual(
      loadInvestigationProgress(analyzed),
    );
  });
});
