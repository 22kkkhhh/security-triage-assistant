/**
 * v1.5 Milestone 3 Workstream F：Security Evidence Provenance Gate Fix regression。
 */
import { describe, expect, it } from "vitest";
import { caseB } from "@/domain/demo";
import { resolveInvestigationProgress } from "@/domain/investigationProgress";
import {
  buildSecurityVerificationSuggestionKey,
  isSecurityVerificationEvidenceResolvedByChecklist,
} from "@/domain/securityEvidenceIdentity";
import type { ChecklistItem } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { generateChecklist } from "@/services/checklist/generateChecklist";
import { createChecklistItemFromComplianceSuggestion } from "@/services/checklist/fromComplianceSuggestion";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";

function targetSecurityAction(analyzed: ReturnType<typeof analyzeSecurityCase>) {
  const targetResult = analyzed.analysisResults.find(
    (r) => r.verificationActions.length > 0 && r.status !== "NORMAL",
  );
  expect(targetResult).toBeDefined();
  const action = targetResult!.verificationActions[0]!;
  return {
    ruleId: targetResult!.ruleId,
    actionId: action.id,
    actionLabel: action.label,
    evidenceKey: `evidence:security:${targetResult!.ruleId}:${action.id}`,
  };
}

function securityChecklistItem(
  ruleId: string,
  actionId: string,
  actionLabel: string,
  overrides: Partial<ChecklistItem> = {},
): ChecklistItem {
  const suggestionKey = buildSecurityVerificationSuggestionKey(ruleId, actionId);
  return {
    id: "CL-sec",
    category: "DATA",
    label: actionLabel,
    completed: true,
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
    ...overrides,
  };
}

function evidenceStatus(
  analyzed: ReturnType<typeof analyzeSecurityCase>,
  checklist: ChecklistItem[],
  evidenceKey: string,
) {
  const progress = resolveInvestigationProgress({
    securityCase: { ...analyzed, checklist },
  });
  return progress.evidenceItems.find((i) => i.key === evidenceKey)?.status;
}

describe("Security Evidence Provenance Gate — blocker regression", () => {
  it("1. SECURITY_VERIFICATION + 正确 suggestionKey → RESOLVED", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const item = securityChecklistItem(ruleId, actionId, actionLabel);
    expect(evidenceStatus(analyzed, [item], evidenceKey)).toBe("RESOLVED");
    expect(
      isSecurityVerificationEvidenceResolvedByChecklist(
        [item],
        ruleId,
        actionId,
      ),
    ).toBe(true);
  });

  it("2. KNOWLEDGE_SUGGESTED + 正确 suggestionKey + relatedRuleId → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const suggestionKey = buildSecurityVerificationSuggestionKey(
      ruleId,
      actionId,
    );
    const knowledgeItem = securityChecklistItem(ruleId, actionId, actionLabel, {
      id: "CL-ks",
      origin: "MANUAL",
      sourceKind: "KNOWLEDGE_SUGGESTED",
      relatedRuleId: ruleId,
      sourceRef: {
        suggestionKey,
        kind: "EVIDENCE",
        controlCodes: ["CTRL-DATA-001"],
        clauseRefs: [],
        relevance: "RELEVANT",
      },
    });
    expect(evidenceStatus(analyzed, [knowledgeItem], evidenceKey)).toBe("OPEN");
  });

  it("3. 其他 sourceKind + 正确 suggestionKey → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const suggestionKey = buildSecurityVerificationSuggestionKey(
      ruleId,
      actionId,
    );
    const otherSource = securityChecklistItem(ruleId, actionId, actionLabel, {
      sourceKind: undefined,
      sourceRef: {
        suggestionKey,
        kind: "EVIDENCE",
        controlCodes: [],
        clauseRefs: [],
        relevance: "",
      },
    });
    expect(evidenceStatus(analyzed, [otherSource], evidenceKey)).toBe("OPEN");
  });

  it("4. SECURITY_VERIFICATION + 错 actionId → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const wrongKey = buildSecurityVerificationSuggestionKey(
      ruleId,
      "wrong-action-id",
    );
    expect(
      evidenceStatus(
        analyzed,
        [
          securityChecklistItem(ruleId, actionId, actionLabel, {
            sourceRef: {
              suggestionKey: wrongKey,
              kind: "EVIDENCE",
              controlCodes: [],
              clauseRefs: [],
              relevance: "",
            },
          }),
        ],
        evidenceKey,
      ),
    ).toBe("OPEN");
  });

  it("5. SECURITY_VERIFICATION + 错 ruleId → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const wrongKey = buildSecurityVerificationSuggestionKey(
      "WRONG-RULE",
      actionId,
    );
    expect(
      evidenceStatus(
        analyzed,
        [
          securityChecklistItem(ruleId, actionId, actionLabel, {
            relatedRuleId: "WRONG-RULE",
            sourceRef: {
              suggestionKey: wrongKey,
              kind: "EVIDENCE",
              controlCodes: [],
              clauseRefs: [],
              relevance: "",
            },
          }),
        ],
        evidenceKey,
      ),
    ).toBe("OPEN");
  });

  it("6. legacy index provenance → Evidence OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const legacyKey = `EVIDENCE:security:${ruleId}:0`;
    expect(
      evidenceStatus(
        analyzed,
        [
          securityChecklistItem(ruleId, actionId, actionLabel, {
            sourceRef: {
              suggestionKey: legacyKey,
              kind: "EVIDENCE",
              controlCodes: [],
              clauseRefs: [],
              relevance: "",
            },
          }),
        ],
        evidenceKey,
      ),
    ).toBe("OPEN");
  });

  it("7. checklist completed 自身 CHECKLIST RESOLVED，Security Evidence 仍 OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);
    const suggestionKey = buildSecurityVerificationSuggestionKey(
      ruleId,
      actionId,
    );
    const knowledgeItem = securityChecklistItem(ruleId, actionId, actionLabel, {
      id: "CL-gate",
      origin: "MANUAL",
      sourceKind: "KNOWLEDGE_SUGGESTED",
      relatedRuleId: ruleId,
      sourceRef: {
        suggestionKey,
        kind: "EVIDENCE",
        controlCodes: [],
        clauseRefs: [],
        relevance: "",
      },
    });
    const progress = resolveInvestigationProgress({
      securityCase: { ...analyzed, checklist: [knowledgeItem] },
    });
    expect(
      progress.checklistItems.find((i) => i.key === "checklist:CL-gate")?.status,
    ).toBe("RESOLVED");
    expect(
      progress.evidenceItems.find((i) => i.key === evidenceKey)?.status,
    ).toBe("OPEN");
  });
});

describe("Security Evidence Provenance Gate — M3E stability preserved", () => {
  it("reorder: completed actionId 仍 RESOLVED，新 action 仍 OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const { ruleId, actionId, actionLabel, evidenceKey } =
      targetSecurityAction(analyzed);

    const withReordered = {
      ...analyzed,
      analysisResults: analyzed.analysisResults.map((r) =>
        r.ruleId === ruleId
          ? {
              ...r,
              verificationActions: [
                { id: "b-action", label: "B" },
                { id: actionId, label: `${actionLabel} renamed` },
              ],
            }
          : r,
      ),
      checklist: [
        securityChecklistItem(ruleId, actionId, `${actionLabel} renamed`),
      ],
    };

    const progress = resolveInvestigationProgress({
      securityCase: withReordered,
    });
    expect(
      progress.evidenceItems.find((i) => i.key === evidenceKey)?.status,
    ).toBe("RESOLVED");
    expect(
      progress.evidenceItems.find(
        (i) => i.key === `evidence:security:${ruleId}:b-action`,
      )?.status,
    ).toBe("OPEN");
  });

  it("generateChecklist 仍写入 SECURITY_VERIFICATION provenance", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const items = generateChecklist(analyzed.analysisResults);
    const secItems = items.filter((i) => i.sourceKind === "SECURITY_VERIFICATION");
    expect(secItems.length).toBeGreaterThan(0);
    for (const item of secItems) {
      expect(item.relatedRuleId).toBeTruthy();
      expect(item.sourceRef?.suggestionKey).toMatch(
        /^EVIDENCE:security:[^:]+:[^:]+$/,
      );
    }
  });

  it("Compliance KNOWLEDGE_SUGGESTED 不被 Security gate 误 resolve", () => {
    const complianceSuggestion: CaseComplianceChecklistItem = {
      key: "EVIDENCE:db-audit",
      kind: "EVIDENCE",
      label: "补充数据库审计日志",
      sourceKey: "db-audit",
      priority: 10,
      controlCodes: ["CTRL-DATA-001"],
      clauseRefs: [],
      relevance: "RELEVANT",
      relationTypes: [],
      ruleIds: [],
      supportingRuleIds: [],
      evidenceIds: [],
    };
    const item = createChecklistItemFromComplianceSuggestion(
      complianceSuggestion,
    );
    const completed = { ...item, completed: true };
    const analyzed = analyzeSecurityCase(caseB);
    const progress = resolveInvestigationProgress({
      securityCase: { ...analyzed, checklist: [completed] },
      complianceFindings: [
        {
          ruleId: "RULE-db-audit",
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
          relationType: "CONTROL_SUPPORT",
          relevance: "RELEVANT",
          rationale: "test",
          missingContext: [],
          suggestedEvidence: [{ key: "db-audit", label: "补充数据库审计日志" }],
          suggestedChecklist: [],
          versionSelectionBasis: "CASE_DATE",
          caseDate: "2026-08-08",
        },
      ],
    });
    expect(
      progress.evidenceItems.find((i) => i.key === "evidence:db-audit")?.status,
    ).toBe("RESOLVED");
    expect(
      progress.evidenceItems.some(
        (i) =>
          i.key.startsWith("evidence:security:") && i.status === "RESOLVED",
      ),
    ).toBe(false);
  });
});
