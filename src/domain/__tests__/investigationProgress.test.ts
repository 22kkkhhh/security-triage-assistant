/**
 * v1.5 Milestone 3 Workstream A：Investigation Progress Domain 测试。
 */
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import {
  resolveInvestigationProgress,
  type InvestigationProgressItem,
} from "@/domain/investigationProgress";
import type { SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { completeChecklistItem } from "@/services/checklist/generateChecklist";

function emptyDraft(): SecurityCaseDraft {
  return {
    id: "empty-case",
    name: "Empty",
    createdAt: "2026-08-08T00:00:00+08:00",
    alert: {
      title: "t",
      source: "s",
      severity: "LOW",
      occurredAt: null,
      description: "",
      originalAlertId: null,
    },
    dataContext: {
      accessStatus: "UNKNOWN",
      databaseName: null,
      tableName: null,
      accessedRecordCount: null,
      sensitiveFieldTypes: [],
      operationType: null,
      outsideBusinessHours: "UNKNOWN",
      baseline: null,
      note: null,
    },
    networkContext: {
      networkStatus: "UNKNOWN",
      internalSourceIp: null,
      externalCommunication: "UNKNOWN",
      externalDestination: null,
      outboundTransferBytes: null,
      note: null,
    },
    identityContext: {
      identityStatus: "UNKNOWN",
      accountName: null,
      failedLoginAttempts: null,
      successfulLogin: null,
      loginFromUnseenSource: "UNKNOWN",
      loginSourceIp: null,
      accessedSystems: [],
      note: null,
    },
    businessContext: {
      plannedTaskStatus: "UNKNOWN",
      changeTicketStatus: "UNKNOWN",
      changeTicketId: null,
      businessOwner: null,
      ownerVerification: "UNKNOWN",
      businessLegitimacy: "UNKNOWN",
      businessJustification: null,
    },
    timeline: [],
    humanReview: null,
    report: null,
  };
}

function openContextKeys(items: InvestigationProgressItem[]): string[] {
  return items
    .filter((i) => i.kind === "CONTEXT" && i.status === "OPEN")
    .map((i) => i.key.replace("context:", ""));
}

describe("Investigation Progress projection", () => {
  it("missing Context → OPEN", () => {
    const analyzed = analyzeSecurityCase(emptyDraft());
    const progress = resolveInvestigationProgress({ securityCase: analyzed });

    expect(openContextKeys(progress.contextItems)).toContain("occurredAt");
    expect(openContextKeys(progress.contextItems)).toContain("dataCategory");
    expect(progress.summary.openContextCount).toBeGreaterThan(0);
    expect(progress.summary.hasUnresolvedInvestigationGaps).toBe(true);
  });

  it("Context 补齐 → RESOLVED", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const progress = resolveInvestigationProgress({ securityCase: analyzed });

    const changeTicket = progress.contextItems.find(
      (i) => i.key === "context:changeTicketId",
    );
    expect(changeTicket?.status).toBe("RESOLVED");
    expect(changeTicket?.kind).toBe("CONTEXT");

    const destination = progress.contextItems.find(
      (i) => i.key === "context:destinationRegion",
    );
    expect(destination?.status).toBe("OPEN");
  });

  it("UNKNOWN → 仍 OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const progress = resolveInvestigationProgress({ securityCase: analyzed });

    const ownerConfirmed = progress.contextItems.find(
      (i) => i.key === "context:businessOwnerConfirmed",
    );
    expect(ownerConfirmed?.status).toBe("OPEN");
  });

  it("suggestedEvidence 未满足 → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const progress = resolveInvestigationProgress({
      securityCase: analyzed,
      complianceFindings: [
        {
          ruleId: "RULE-DATA-001",
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
          suggestedEvidence: [
            { key: "db-audit", label: "保全数据库访问日志" },
          ],
          suggestedChecklist: [],
          versionSelectionBasis: "CASE_DATE",
          caseDate: "2026-08-08",
        },
      ],
    });

    const evidence = progress.evidenceItems.find(
      (i) => i.key === "evidence:db-audit",
    );
    expect(evidence?.status).toBe("OPEN");
    expect(evidence?.kind).toBe("EVIDENCE");
  });

  it("Checklist 未完成 → OPEN", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const progress = resolveInvestigationProgress({ securityCase: analyzed });

    expect(progress.checklistItems.some((i) => i.status === "OPEN")).toBe(true);
    expect(progress.summary.openChecklistCount).toBeGreaterThan(0);
  });

  it("Checklist completed → RESOLVED", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const target = analyzed.checklist.find((i) => !i.completed);
    expect(target).toBeDefined();

    const completedChecklist = analyzed.checklist.map((item) =>
      item.id === target!.id ? completeChecklistItem(item) : item,
    );
    const withCompleted: typeof analyzed = {
      ...analyzed,
      checklist: completedChecklist,
    };

    const progress = resolveInvestigationProgress({ securityCase: withCompleted });
    const item = progress.checklistItems.find(
      (i) => i.key === `checklist:${target!.id}`,
    );
    expect(item?.status).toBe("RESOLVED");
  });

  it("KNOWLEDGE_SUGGESTED 正确参与，但不被修改", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const knowledgeItem = {
      id: "CL-KS-verify-ticket-abc",
      category: "BUSINESS" as const,
      label: "核实该操作是否存在有效授权工单",
      completed: false,
      note: null,
      origin: "MANUAL" as const,
      relatedRuleId: null,
      sourceKind: "KNOWLEDGE_SUGGESTED" as const,
      sourceRef: {
        suggestionKey: "CHECKLIST:verify-ticket",
        kind: "CHECKLIST" as const,
        controlCodes: ["CTRL-BUSINESS-001"],
        clauseRefs: [{ clauseKey: "PIPL-38", documentCanonicalCode: "PIPL" }],
        relevance: "RELEVANT" as const,
      },
    };

    const withKnowledge: typeof analyzed = {
      ...analyzed,
      checklist: [...analyzed.checklist, knowledgeItem],
    };

    const progress = resolveInvestigationProgress({ securityCase: withKnowledge });
    const item = progress.checklistItems.find(
      (i) => i.key === "checklist:CL-KS-verify-ticket-abc",
    );
    expect(item).toBeDefined();
    expect(item?.status).toBe("OPEN");
    expect(item?.sourceRefs[0]?.label).toBe("KNOWLEDGE_SUGGESTED");
    expect(withKnowledge.checklist).toHaveLength(analyzed.checklist.length + 1);
  });

  it("同一 gap 去重/稳定 key", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const findings = [
      {
        ruleId: "RULE-DATA-001",
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
        suggestedEvidence: [
          { key: "db-audit", label: "保全数据库访问日志" },
        ],
        suggestedChecklist: [],
        versionSelectionBasis: "CASE_DATE" as const,
        caseDate: "2026-08-08",
      },
      {
        ruleId: "RULE-DATA-002",
        supportingRuleIds: [],
        evidenceIds: [],
        controlId: "ctrl-2",
        controlCode: "CTRL-DATA-002",
        documentId: "doc-1",
        documentCanonicalCode: "PIPL",
        documentVersionId: "ver-1",
        versionKey: "2021",
        clauseId: "clause-2",
        clauseKey: "PIPL-39",
        relationType: "CONTROL_SUPPORT" as const,
        relevance: "RELEVANT" as const,
        rationale: "test2",
        missingContext: [],
        suggestedEvidence: [
          { key: "db-audit", label: "保全数据库访问日志" },
        ],
        suggestedChecklist: [],
        versionSelectionBasis: "CASE_DATE" as const,
        caseDate: "2026-08-08",
      },
    ];

    const progress = resolveInvestigationProgress({
      securityCase: analyzed,
      complianceFindings: findings,
    });

    const dbAuditItems = progress.evidenceItems.filter(
      (i) => i.key === "evidence:db-audit",
    );
    expect(dbAuditItems).toHaveLength(1);
    expect(dbAuditItems[0]?.relatedRuleIds).toEqual([
      "RULE-DATA-001",
      "RULE-DATA-002",
    ]);
  });

  it("deterministic：相同输入多次解析输出一致", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const first = resolveInvestigationProgress({ securityCase: analyzed });
    const second = resolveInvestigationProgress({ securityCase: analyzed });
    expect(first).toEqual(second);
  });

  it("HumanReview 仅作事实陈述，不推导 Case 结论", () => {
    const analyzedEmpty = analyzeSecurityCase(emptyDraft());
    const withoutReview = resolveInvestigationProgress({
      securityCase: analyzedEmpty,
    });
    expect(withoutReview.summary.humanReviewSubmitted).toBe(false);

    const analyzedA = analyzeSecurityCase(caseA);
    const withReview = resolveInvestigationProgress({ securityCase: analyzedA });
    expect(withReview.summary.humanReviewSubmitted).toBe(true);
    expect(withReview.summary.hasUnresolvedInvestigationGaps).toBe(true);
  });
});
