/**
 * v1.5 Milestone 3 Workstream D：Stable Evidence Identity Fix regression。
 */
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { resolveInvestigationProgress } from "@/domain/investigationProgress";
import {
  buildSecurityVerificationSuggestionKey,
  LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE,
} from "@/domain/securityEvidenceIdentity";
import type { ChecklistItem, SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  completeChecklistItem,
  generateChecklist,
} from "@/services/checklist/generateChecklist";
import { createChecklistItemFromComplianceSuggestion } from "@/services/checklist/fromComplianceSuggestion";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";
import { refreshCaseComplianceRuntimeFromGraph } from "@/services/knowledge/refreshCaseComplianceRuntime";
import { resolveInvestigationContext } from "@/services/knowledge/resolveInvestigationContext";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { loadInvestigationProgress } from "@/services/knowledge/resolveInvestigationProgress";

const sharedEvidenceLabel = "保全网关访问日志";

function suggestion(
  overrides: Partial<CaseComplianceChecklistItem> &
    Pick<CaseComplianceChecklistItem, "key" | "kind" | "label">,
): CaseComplianceChecklistItem {
  return {
    sourceKey: overrides.sourceKey ?? overrides.key.replace(/^EVIDENCE:/, ""),
    description: undefined,
    priority: 10,
    controlCodes: overrides.controlCodes ?? ["CTRL-DATA-001"],
    clauseRefs: overrides.clauseRefs ?? [
      { clauseKey: "PIPL-38", documentCanonicalCode: "PIPL" },
    ],
    relevance: overrides.relevance ?? "RELEVANT",
    relationTypes: overrides.relationTypes ?? ["CONTROL_SUPPORT"],
    ruleIds: ["RULE-DATA-001"],
    supportingRuleIds: [],
    evidenceIds: [],
    ...overrides,
  };
}

function complianceFindingWithEvidence(
  key: string,
  label: string = sharedEvidenceLabel,
) {
  return {
    ruleId: `RULE-${key}`,
    supportingRuleIds: [],
    evidenceIds: [],
    controlId: "ctrl-1",
    controlCode: "CTRL-DATA-001",
    documentId: "doc-1",
    documentCanonicalCode: "PIPL",
    documentVersionId: "ver-1",
    versionKey: "2021",
    clauseId: "clause-1",
    clauseKey: "PIPL-38",
    relationType: "CONTROL_SUPPORT" as const,
    relevance: "RELEVANT" as const,
    rationale: "test",
    missingContext: [],
    suggestedEvidence: [{ key, label }],
    suggestedChecklist: [],
    versionSelectionBasis: "CASE_DATE" as const,
    caseDate: "2026-08-08",
  };
}

describe("Evidence identity fix — Compliance", () => {
  it("正确 suggestionKey + completed checklist → Evidence RESOLVED", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const suggestionItem = createChecklistItemFromComplianceSuggestion(
      suggestion({
        key: "EVIDENCE:db-audit",
        kind: "EVIDENCE",
        label: sharedEvidenceLabel,
      }),
    );
    const withChecklist = {
      ...analyzed,
      checklist: [
        ...analyzed.checklist,
        completeChecklistItem(suggestionItem),
      ],
    };

    const progress = resolveInvestigationProgress({
      securityCase: withChecklist,
      complianceFindings: [
        complianceFindingWithEvidence("db-audit", sharedEvidenceLabel),
      ],
    });

    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:db-audit")?.status,
    ).toBe("RESOLVED");
  });

  it("label 相同但 suggestionKey 不同 → Evidence OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const wrongSuggestion = createChecklistItemFromComplianceSuggestion(
      suggestion({
        key: "EVIDENCE:gateway-log",
        kind: "EVIDENCE",
        label: sharedEvidenceLabel,
      }),
    );
    const withChecklist = {
      ...analyzed,
      checklist: [
        ...analyzed.checklist,
        completeChecklistItem(wrongSuggestion),
      ],
    };

    const progress = resolveInvestigationProgress({
      securityCase: withChecklist,
      complianceFindings: [
        complianceFindingWithEvidence("db-audit", sharedEvidenceLabel),
      ],
    });

    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:db-audit")?.status,
    ).toBe("OPEN");
  });

  it("label 相同但 provenance/sourceKind 不同 → Evidence OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const legacySystemItem: ChecklistItem = {
      id: "CL-legacy",
      category: "DATA",
      label: sharedEvidenceLabel,
      completed: true,
      note: null,
      origin: "SYSTEM",
      relatedRuleId: "DATA-001",
    };
    const withChecklist = {
      ...analyzed,
      checklist: [...analyzed.checklist, legacySystemItem],
    };

    const progress = resolveInvestigationProgress({
      securityCase: withChecklist,
      complianceFindings: [
        complianceFindingWithEvidence("db-audit", sharedEvidenceLabel),
      ],
    });

    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:db-audit")?.status,
    ).toBe("OPEN");
  });

  it("两个 Evidence suggestion 相同 label、不同 stable key → 不能互相 resolve", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const gatewayItem = completeChecklistItem(
      createChecklistItemFromComplianceSuggestion(
        suggestion({
          key: "EVIDENCE:gateway-log",
          kind: "EVIDENCE",
          label: sharedEvidenceLabel,
          controlCodes: ["CTRL-NET-001"],
        }),
      ),
    );
    const withChecklist = {
      ...analyzed,
      checklist: [...analyzed.checklist, gatewayItem],
    };

    const progress = resolveInvestigationProgress({
      securityCase: withChecklist,
      complianceFindings: [
        complianceFindingWithEvidence("gateway-log", sharedEvidenceLabel),
        complianceFindingWithEvidence("db-audit", sharedEvidenceLabel),
      ],
    });

    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:gateway-log")
        ?.status,
    ).toBe("RESOLVED");
    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:db-audit")?.status,
    ).toBe("OPEN");
  });
});

describe("Evidence identity fix — Security", () => {
  it("verificationAction 与 completed checklist label 相同但无 stable identity → Evidence OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const actionLabel =
      analyzed.analysisResults.find((r) => r.verificationActions.length > 0)
        ?.verificationActions[0]?.label ?? "";
    expect(actionLabel.length).toBeGreaterThan(0);

    const legacyCompleted: ChecklistItem = {
      id: "CL-legacy-security",
      category: "DATA",
      label: actionLabel,
      completed: true,
      note: null,
      origin: "SYSTEM",
      relatedRuleId:
        analyzed.analysisResults.find((r) => r.verificationActions.length > 0)
          ?.ruleId ?? null,
    };

    const withLegacy = {
      ...analyzed,
      checklist: [...analyzed.checklist, legacyCompleted],
    };

    const progress = resolveInvestigationProgress({ securityCase: withLegacy });
    const securityEvidence = progress.evidenceItems.filter((i) =>
      i.relatedRuleIds.includes(legacyCompleted.relatedRuleId!),
    );
    expect(securityEvidence.some((i) => i.status === "RESOLVED")).toBe(false);
    expect(LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE).toBeTruthy();
  });

  it("正确 stable identity → RESOLVED", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const targetResult = analyzed.analysisResults.find(
      (r) => r.verificationActions.length > 0 && r.status !== "NORMAL",
    );
    expect(targetResult).toBeDefined();

    const actionId = targetResult!.verificationActions[0]!.id;
    const suggestionKey = buildSecurityVerificationSuggestionKey(
      targetResult!.ruleId,
      actionId,
    );
    const systemItem = analyzed.checklist.find(
      (i) => i.sourceRef?.suggestionKey === suggestionKey,
    );
    expect(systemItem).toBeDefined();

    const withCompleted = {
      ...analyzed,
      checklist: analyzed.checklist.map((item) =>
        item.id === systemItem!.id ? completeChecklistItem(item) : item,
      ),
    };

    const progress = resolveInvestigationProgress({
      securityCase: withCompleted,
    });
    const evidenceKey = `evidence:security:${targetResult!.ruleId}:${actionId}`;
    expect(
      progress.evidenceItems.find((i) => i.key === evidenceKey)?.status,
    ).toBe("RESOLVED");
  });

  it("错误 ruleId/evidenceKey → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const targetResult = analyzed.analysisResults.find(
      (r) => r.verificationActions.length > 0 && r.status !== "NORMAL",
    );
    expect(targetResult).toBeDefined();

    const wrongKey = buildSecurityVerificationSuggestionKey("WRONG-RULE", "wrong-action");
    const wrongItem: ChecklistItem = {
      id: "CL-wrong",
      category: "DATA",
      label: targetResult!.verificationActions[0]!.label,
      completed: true,
      note: null,
      origin: "SYSTEM",
      relatedRuleId: "WRONG-RULE",
      sourceKind: "SECURITY_VERIFICATION",
      sourceRef: {
        suggestionKey: wrongKey,
        kind: "EVIDENCE",
        controlCodes: [],
        clauseRefs: [],
        relevance: "",
      },
    };

    const withWrong = {
      ...analyzed,
      checklist: [...analyzed.checklist, wrongItem],
    };

    const progress = resolveInvestigationProgress({ securityCase: withWrong });
    const actionId = targetResult!.verificationActions[0]!.id;
    const evidenceKey = `evidence:security:${targetResult!.ruleId}:${actionId}`;
    expect(
      progress.evidenceItems.find((i) => i.key === evidenceKey)?.status,
    ).toBe("OPEN");
  });
});

describe("Evidence identity fix — Checklist vs Evidence separation", () => {
  it("checklist completed 自身 RESOLVED，即使 Evidence 仍 OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const legacyCompleted: ChecklistItem = {
      id: "CL-only-checklist",
      category: "DATA",
      label: sharedEvidenceLabel,
      completed: true,
      note: null,
      origin: "SYSTEM",
      relatedRuleId: "DATA-001",
    };
    const withChecklist = {
      ...analyzed,
      checklist: [...analyzed.checklist, legacyCompleted],
    };

    const progress = resolveInvestigationProgress({
      securityCase: withChecklist,
      complianceFindings: [
        complianceFindingWithEvidence("db-audit", sharedEvidenceLabel),
      ],
    });

    expect(
      progress.checklistItems.find((i) => i.key === "checklist:CL-only-checklist")
        ?.status,
    ).toBe("RESOLVED");
    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:db-audit")?.status,
    ).toBe("OPEN");
  });
});

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

describe("Evidence identity fix — Regression", () => {
  it("generateChecklist 为 SYSTEM 项写入 stable provenance", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const generated = generateChecklist(analyzed.analysisResults);
    const withProvenance = generated.filter(
      (i) => i.sourceKind === "SECURITY_VERIFICATION",
    );
    expect(withProvenance.length).toBeGreaterThan(0);
    for (const item of withProvenance) {
      expect(item.sourceRef?.suggestionKey).toMatch(/^EVIDENCE:security:/);
      expect(item.sourceRef?.kind).toBe("EVIDENCE");
    }
  });

  it("M1 refresh / M2 catalog / M3 progress deterministic + Case A/B", () => {
    const analyzedA = analyzeSecurityCase(caseA);
    const analyzedB = analyzeSecurityCase(caseB);

    const progressA1 = resolveInvestigationProgress({ securityCase: analyzedA });
    const progressA2 = resolveInvestigationProgress({ securityCase: analyzedA });
    expect(progressA1).toEqual(progressA2);

    const contextB = resolveInvestigationContext(caseB);
    expect(contextB.entries.length).toBeGreaterThan(0);

    const record = toRecord(caseB);
    const refreshed = refreshCaseComplianceRuntimeFromGraph(record, packGraph, {
      capturedAt: "2026-08-09T12:00:00.000Z",
    });
    expect(refreshed.views.panel.totalCount).toBeGreaterThan(0);

    const loaded = loadInvestigationProgress(analyzedB);
    expect(loaded.summary.openCount).toBeGreaterThanOrEqual(0);
  });

  it("frozen report complianceReferences 不受 progress resolve 影响", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const frozenSnapshot = {
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
      relationType: "CONTROL_SUPPORT" as const,
      rationaleSnapshot: "frozen snapshot",
      sourceUrl: null,
      issuingAuthority: null,
      effectiveDate: null,
      sourceType: null,
      capturedAt: "2026-08-08T00:00:00+08:00",
      caseDate: "2026-08-08",
      versionSelectionBasis: "CASE_DATE" as const,
      controlId: "ctrl-1",
      controlCode: "CTRL-DATA-001",
      ruleId: "RULE-DATA-001",
      supportingRuleIds: [],
      evidenceIds: [],
      relevance: "RELEVANT" as const,
      contentMode: "SUMMARY_ONLY" as const,
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
    resolveInvestigationProgress({ securityCase: withReport });
    expect(withReport.report?.complianceReferences).toHaveLength(1);
    expect(withReport.report?.complianceReferences?.[0]?.rationaleSnapshot).toBe(
      "frozen snapshot",
    );
  });
});
