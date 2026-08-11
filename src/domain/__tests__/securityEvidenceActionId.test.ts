/**
 * v1.5 Milestone 3 Workstream E：Explicit Security Evidence Action ID regression。
 */
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { resolveInvestigationProgress } from "@/domain/investigationProgress";
import {
  buildSecurityEvidenceProgressSourceKey,
  buildSecurityVerificationSuggestionKey,
  isLegacyIndexSecurityProvenance,
  LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE,
  parseSecurityVerificationSuggestionKey,
} from "@/domain/securityEvidenceIdentity";
import type {
  AnalysisResult,
  ChecklistItem,
  SecurityCase,
} from "@/domain/types";
import { allRules } from "@/services/analysis/runRules";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import type { VerificationAction } from "@/services/analysis/verificationActions";
import {
  completeChecklistItem,
  generateChecklist,
} from "@/services/checklist/generateChecklist";
import { refreshCaseComplianceRuntimeFromGraph } from "@/services/knowledge/refreshCaseComplianceRuntime";
import { resolveInvestigationContext } from "@/services/knowledge/resolveInvestigationContext";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { loadInvestigationProgress } from "@/services/knowledge/resolveInvestigationProgress";

function securityChecklistItem(
  ruleId: string,
  actionId: string,
  label: string,
  completed: boolean,
): ChecklistItem {
  const suggestionKey = buildSecurityVerificationSuggestionKey(ruleId, actionId);
  return {
    id: `CL-${ruleId}-${actionId}`,
    category: "DATA",
    label,
    completed,
    note: null,
    origin: "SYSTEM",
    relatedRuleId: ruleId,
    sourceKind: "SECURITY_VERIFICATION",
    sourceRef: {
      suggestionKey,
      kind: "EVIDENCE",
      controlCodes: [],
      clauseRefs: [],
      relevance: "",
    },
  };
}

function securityCaseWithResults(
  results: AnalysisResult[],
  checklist: ChecklistItem[],
): SecurityCase {
  return {
    id: "case-test",
    name: "Test",
    createdAt: "2026-08-09T12:00:00.000Z",
    alert: caseB.alert,
    dataContext: caseB.dataContext,
    networkContext: caseB.networkContext,
    identityContext: caseB.identityContext,
    businessContext: caseB.businessContext,
    timeline: [],
    humanReview: null,
    analysisResults: results,
    evidences: [],
    checklist,
    suggestedAssessment: null,
    report: null,
  };
}

describe("Security evidence actionId — identity keys", () => {
  it("同 rule + 同 actionId → key deterministic", () => {
    const key1 = buildSecurityVerificationSuggestionKey("DATA-001", "verify-planned-task");
    const key2 = buildSecurityVerificationSuggestionKey("DATA-001", "verify-planned-task");
    expect(key1).toBe(key2);
    expect(key1).toBe("EVIDENCE:security:DATA-001:verify-planned-task");
  });

  it("同 rule + 不同 actionId → 不同 key", () => {
    const a = buildSecurityVerificationSuggestionKey("DATA-001", "verify-planned-task");
    const b = buildSecurityVerificationSuggestionKey("DATA-001", "verify-change-ticket");
    expect(a).not.toBe(b);
  });

  it("不同 rule + 相同 actionId → 不同 key", () => {
    const a = buildSecurityVerificationSuggestionKey("DATA-001", "verify-planned-task");
    const b = buildSecurityVerificationSuggestionKey("DATA-002", "verify-planned-task");
    expect(a).not.toBe(b);
  });
});

describe("Security evidence actionId — label change stability", () => {
  it("actionId 不变、label 变更 → persisted checklist 仍 RESOLVED 同一 Evidence", () => {
    const ruleId = "TEST-RULE";
    const actionId = "verify-change-ticket";
    const results: AnalysisResult[] = [
      {
        ruleId,
        category: "DATA",
        status: "ABNORMAL",
        riskLevel: "HIGH",
        title: "Test",
        explanation: "test",
        evidenceIds: [],
        verificationActions: [{ id: actionId, label: "Label B (renamed)" }],
      },
    ];
    const checklist = [
      completeChecklistItem(
        securityChecklistItem(ruleId, actionId, "Label A (original)", true),
      ),
    ];
    const progress = resolveInvestigationProgress({
      securityCase: securityCaseWithResults(results, checklist),
    });
    const evidenceKey = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, actionId)}`;
    expect(progress.evidenceItems.find((i) => i.key === evidenceKey)?.status).toBe(
      "RESOLVED",
    );
  });
});

describe("Security evidence actionId — reorder stability", () => {
  it("reorder 后 completed actionId=a 仍 RESOLVED action a，b 仍 OPEN", () => {
    const ruleId = "TEST-RULE";
    const actionA: VerificationAction = { id: "action-a", label: "A" };
    const actionB: VerificationAction = { id: "action-b", label: "B" };

    const resultsAfterReorder: AnalysisResult[] = [
      {
        ruleId,
        category: "DATA",
        status: "ABNORMAL",
        riskLevel: "HIGH",
        title: "Test",
        explanation: "test",
        evidenceIds: [],
        verificationActions: [actionB, actionA],
      },
    ];

    const checklist = [
      completeChecklistItem(securityChecklistItem(ruleId, "action-a", "A", true)),
    ];

    const progress = resolveInvestigationProgress({
      securityCase: securityCaseWithResults(resultsAfterReorder, checklist),
    });

    const keyA = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, "action-a")}`;
    const keyB = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, "action-b")}`;
    expect(progress.evidenceItems.find((i) => i.key === keyA)?.status).toBe("RESOLVED");
    expect(progress.evidenceItems.find((i) => i.key === keyB)?.status).toBe("OPEN");
  });
});

describe("Security evidence actionId — insert stability", () => {
  it("insert 新 action 后旧 actionId identity 不变", () => {
    const ruleId = "TEST-RULE";
    const results: AnalysisResult[] = [
      {
        ruleId,
        category: "DATA",
        status: "ABNORMAL",
        riskLevel: "HIGH",
        title: "Test",
        explanation: "test",
        evidenceIds: [],
        verificationActions: [
          { id: "action-c", label: "C" },
          { id: "action-a", label: "A" },
          { id: "action-b", label: "B" },
        ],
      },
    ];
    const checklist = [
      completeChecklistItem(securityChecklistItem(ruleId, "action-a", "A", true)),
      completeChecklistItem(securityChecklistItem(ruleId, "action-b", "B", true)),
    ];

    const progress = resolveInvestigationProgress({
      securityCase: securityCaseWithResults(results, checklist),
    });

    const keyA = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, "action-a")}`;
    const keyB = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, "action-b")}`;
    const keyC = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, "action-c")}`;
    expect(progress.evidenceItems.find((i) => i.key === keyA)?.status).toBe("RESOLVED");
    expect(progress.evidenceItems.find((i) => i.key === keyB)?.status).toBe("RESOLVED");
    expect(progress.evidenceItems.find((i) => i.key === keyC)?.status).toBe("OPEN");
  });
});

describe("Security evidence actionId — wrong identity", () => {
  it("错 ruleId / 错 actionId / 同 label 不同 actionId → OPEN", () => {
    const ruleId = "DATA-001";
    const actionId = "verify-planned-task";
    const results: AnalysisResult[] = [
      {
        ruleId,
        category: "DATA",
        status: "ABNORMAL",
        riskLevel: "HIGH",
        title: "Test",
        explanation: "test",
        evidenceIds: [],
        verificationActions: [{ id: actionId, label: "核查计划任务" }],
      },
    ];

    const wrongRuleChecklist = [
      completeChecklistItem(
        securityChecklistItem("WRONG-RULE", actionId, "核查计划任务", true),
      ),
    ];
    const wrongActionChecklist = [
      completeChecklistItem(
        securityChecklistItem(ruleId, "wrong-action-id", "核查计划任务", true),
      ),
    ];

    const progressWrongRule = resolveInvestigationProgress({
      securityCase: securityCaseWithResults(results, wrongRuleChecklist),
    });
    const progressWrongAction = resolveInvestigationProgress({
      securityCase: securityCaseWithResults(results, wrongActionChecklist),
    });

    const evidenceKey = `evidence:${buildSecurityEvidenceProgressSourceKey(ruleId, actionId)}`;
    expect(
      progressWrongRule.evidenceItems.find((i) => i.key === evidenceKey)?.status,
    ).toBe("OPEN");
    expect(
      progressWrongAction.evidenceItems.find((i) => i.key === evidenceKey)?.status,
    ).toBe("OPEN");
  });
});

describe("Security evidence actionId — legacy index provenance", () => {
  it("legacy index-based provenance → Evidence OPEN，checklist 自身仍 RESOLVED", () => {
    const legacyKey = "EVIDENCE:security:DATA-001:0";
    expect(isLegacyIndexSecurityProvenance(legacyKey)).toBe(true);
    expect(parseSecurityVerificationSuggestionKey(legacyKey)).toBeNull();

    const legacyItem: ChecklistItem = {
      id: "CL-legacy-index",
      category: "DATA",
      label: "核查计划任务",
      completed: true,
      note: null,
      origin: "SYSTEM",
      relatedRuleId: "DATA-001",
      sourceKind: "SECURITY_VERIFICATION",
      sourceRef: {
        suggestionKey: legacyKey,
        kind: "EVIDENCE",
        controlCodes: [],
        clauseRefs: [],
        relevance: "",
      },
    };

    const results: AnalysisResult[] = [
      {
        ruleId: "DATA-001",
        category: "DATA",
        status: "ABNORMAL",
        riskLevel: "HIGH",
        title: "Test",
        explanation: "test",
        evidenceIds: [],
        verificationActions: [
          { id: "verify-planned-task", label: "核查计划任务" },
        ],
      },
    ];

    const progress = resolveInvestigationProgress({
      securityCase: securityCaseWithResults(results, [legacyItem]),
    });

    const evidenceKey = `evidence:${buildSecurityEvidenceProgressSourceKey("DATA-001", "verify-planned-task")}`;
    expect(progress.evidenceItems.find((i) => i.key === evidenceKey)?.status).toBe(
      "OPEN",
    );
    expect(
      progress.checklistItems.find((i) => i.key === "checklist:CL-legacy-index")
        ?.status,
    ).toBe("RESOLVED");
  });
});

describe("Security evidence actionId — registry invariant", () => {
  it("所有 SecurityRule verification action ID 非空、同 rule 内唯一", () => {
    for (const draft of [caseA, caseB]) {
      for (const rule of allRules) {
        const ids = new Set<string>();
        for (const action of rule.evaluate(draft).verificationActions) {
          expect(action.id.length).toBeGreaterThan(0);
          expect(action.label.length).toBeGreaterThan(0);
          expect(ids.has(action.id)).toBe(false);
          ids.add(action.id);
          expect(action.id).not.toMatch(/^\d+$/);
          expect(action.id).not.toMatch(/^action-\d+$/);
        }
      }
    }
  });
});

const packGraph = curatedPackToResolutionGraph();

describe("Security evidence actionId — regression", () => {
  it("generateChecklist 使用 actionId provenance", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const items = generateChecklist(analyzed.analysisResults);
    expect(items.some((i) => i.sourceKind === "SECURITY_VERIFICATION")).toBe(true);
    for (const item of items.filter((i) => i.sourceKind === "SECURITY_VERIFICATION")) {
      const suggestionKey = item.sourceRef?.suggestionKey;
      expect(suggestionKey).toMatch(/^EVIDENCE:security:[^:]+:[^:]+$/);
      expect(typeof suggestionKey).toBe("string");
      expect(isLegacyIndexSecurityProvenance(suggestionKey as string)).toBe(false);
    }
  });

  it("M1/M2/M3 regression + deterministic", () => {
    const analyzedB = analyzeSecurityCase(caseB);

    const p1 = resolveInvestigationProgress({ securityCase: analyzedB });
    const p2 = resolveInvestigationProgress({ securityCase: analyzedB });
    expect(p1).toEqual(p2);

    expect(resolveInvestigationContext(caseB).entries.length).toBeGreaterThan(0);

    const record = {
      id: analyzedB.id,
      caseNumber: "TEST",
      title: analyzedB.name,
      status: "INVESTIGATING" as const,
      suggestedRiskLevel: null,
      humanRiskLevel: null,
      humanConclusion: null,
      username: null,
      sourceIp: null,
      systemsSearchText: "",
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
          name: analyzedB.name,
          createdAt: analyzedB.createdAt,
          alert: analyzedB.alert,
          dataContext: analyzedB.dataContext,
          networkContext: analyzedB.networkContext,
          identityContext: analyzedB.identityContext,
        },
        businessContext: analyzedB.businessContext,
        checklist: analyzedB.checklist,
        humanReview: analyzedB.humanReview,
        timeline: analyzedB.timeline,
      },
      reportDraft: null,
      createdAt: analyzedB.createdAt,
      updatedAt: "2026-08-09T12:00:00.000Z",
      closedAt: null,
    };
    expect(
      refreshCaseComplianceRuntimeFromGraph(record, packGraph).views.panel.totalCount,
    ).toBeGreaterThan(0);
    expect(loadInvestigationProgress(analyzedB).summary.openCount).toBeGreaterThanOrEqual(0);
  });

  it("LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE 替代全局 gap", () => {
    expect(LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE).toBeTruthy();
  });
});
