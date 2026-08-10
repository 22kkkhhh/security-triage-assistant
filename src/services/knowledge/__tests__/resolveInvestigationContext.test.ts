/**
 * v1.5 Workstream A：Investigation Context Catalog / Resolver 测试。
 */
import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import {
  CONTEXT_MODEL_GAPS,
  INVESTIGATION_CONTEXT_CATALOG,
  collectInvestigationContextAvailableKeys,
  resolveInvestigationContextState,
} from "@/domain/investigationContext";
import type { SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import {
  refreshCaseComplianceRuntimeFromGraph,
} from "@/services/knowledge/refreshCaseComplianceRuntime";
import { collectAvailableContextKeys } from "@/services/knowledge/resolveCaseCompliance";
import { resolveInvestigationContext } from "@/services/knowledge/resolveInvestigationContext";

const packGraph = curatedPackToResolutionGraph();

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

describe("Investigation Context Catalog", () => {
  it("catalog 覆盖 collectAvailableContextKeys 全部稳定 key", () => {
    expect(INVESTIGATION_CONTEXT_CATALOG.length).toBe(18);
    expect(INVESTIGATION_CONTEXT_CATALOG.map((d) => d.key)).toEqual([
      "occurredAt",
      "accessedRecordCount",
      "dataCategory",
      "databaseName",
      "tableName",
      "loginSourceIp",
      "accountName",
      "accessedSystems",
      "failedLoginAttempts",
      "outboundVolume",
      "externalDestination",
      "destinationRegion",
      "internalSourceIp",
      "changeTicketId",
      "businessOwner",
      "businessOwnerConfirmed",
      "businessJustification",
      "plannedTaskStatus",
    ]);
  });

  it("collectInvestigationContextAvailableKeys 与 collectAvailableContextKeys 一致", () => {
    for (const draft of [caseA, caseB, emptyDraft()]) {
      expect(collectInvestigationContextAvailableKeys(draft)).toEqual(
        collectAvailableContextKeys(draft),
      );
    }
  });

  it("Case A：BusinessContext key 解析为 PRESENT", () => {
    const resolution = resolveInvestigationContext(caseA);
    const byKey = Object.fromEntries(
      resolution.entries.map((e) => [e.key, e]),
    );

    expect(byKey.changeTicketId?.status).toBe("PRESENT");
    expect(byKey.changeTicketId?.valueSummary).toBe("CHG-20260808-003");
    expect(byKey.businessOwnerConfirmed?.status).toBe("PRESENT");
    expect(byKey.businessOwner?.status).toBe("PRESENT");
    expect(byKey.plannedTaskStatus?.status).toBe("PRESENT");
    expect(byKey.dataCategory?.status).toBe("PRESENT");
    expect(byKey.destinationRegion?.status).toBe("MISSING");
  });

  it("Case B：DataContext / NetworkContext key 解析", () => {
    const resolution = resolveInvestigationContext(caseB);
    const byKey = Object.fromEntries(
      resolution.entries.map((e) => [e.key, e]),
    );

    expect(byKey.dataCategory?.status).toBe("PRESENT");
    expect(byKey.accessedRecordCount?.status).toBe("PRESENT");
    expect(byKey.outboundVolume?.status).toBe("PRESENT");
    expect(byKey.destinationRegion?.status).toBe("MISSING");
    expect(byKey.externalDestination?.status).toBe("PRESENT");
    expect(byKey.loginSourceIp?.status).toBe("PRESENT");
    expect(byKey.failedLoginAttempts?.status).toBe("PRESENT");
  });

  it("Case B：缺失 BusinessContext → MISSING / UNKNOWN", () => {
    const resolution = resolveInvestigationContext(caseB);
    const byKey = Object.fromEntries(
      resolution.entries.map((e) => [e.key, e]),
    );

    expect(byKey.changeTicketId?.status).toBe("MISSING");
    expect(byKey.businessOwner?.status).toBe("MISSING");
    expect(byKey.businessOwnerConfirmed?.status).toBe("UNKNOWN");
    expect(byKey.plannedTaskStatus?.status).toBe("PRESENT");
    expect(byKey.plannedTaskStatus?.valueSummary).toBe("NOT_FOUND");
    expect(byKey.businessJustification?.status).toBe("MISSING");
  });

  it("requiredContext 缺失 → missingRequirements（INSUFFICIENT_CONTEXT 前置）", () => {
    const requirements = [
      { key: "destinationRegion", label: "目的地区域" },
      { key: "dataCategory", label: "数据类型" },
    ];

    const caseAResolution = resolveInvestigationContext(caseA, { requirements });
    expect(caseAResolution.missingRequirements.map((r) => r.key)).toEqual([
      "destinationRegion",
    ]);

    const caseBResolution = resolveInvestigationContext(caseB, { requirements });
    expect(caseBResolution.missingRequirements.map((r) => r.key)).toEqual([
      "destinationRegion",
    ]);
  });

  it("deterministic：相同 draft 多次解析输出一致", () => {
    const first = resolveInvestigationContextState(caseB);
    const second = resolveInvestigationContextState(caseB);
    expect(first).toEqual(second);
    expect(first.availableKeys).toEqual(second.availableKeys);
  });

  it("runtime consumer 标记：compliance / security keys", () => {
    const resolution = resolveInvestigationContext(caseB);
    expect(resolution.complianceRuntimeKeys).toContain("dataCategory");
    expect(resolution.complianceRuntimeKeys).toContain("destinationRegion");
    expect(resolution.securityRuntimeKeys).toContain("accountName");
    expect(resolution.securityRuntimeKeys).toContain("databaseName");
  });

  it("Case A/B regression：availableKeys 仍满足 compliance 路径", () => {
    const keysA = collectAvailableContextKeys(caseA);
    expect(keysA).toContain("changeTicketId");
    expect(keysA).toContain("businessOwnerConfirmed");

    const keysB = collectAvailableContextKeys(caseB);
    expect(keysB).toContain("dataCategory");
    expect(keysB).toContain("loginSourceIp");
    expect(keysB).not.toContain("destinationRegion");
  });

  it("M1 compliance refresh regression：context catalog 不影响 refresh 输出", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const record = {
      id: caseB.id,
      caseNumber: "TEST-B",
      title: caseB.name,
      status: "INVESTIGATING" as const,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      humanRiskLevel: null,
      humanConclusion: null,
      username: caseB.identityContext.accountName,
      sourceIp: caseB.identityContext.loginSourceIp,
      systemsSearchText: caseB.identityContext.accessedSystems.join(" "),
      pendingChecklistCount: 0,
      hasReport: false,
      reportUpdatedAt: null,
      lastActivityAt: "2026-08-09T12:00:00.000Z",
      caseState: {
        caseData: {
          name: caseB.name,
          createdAt: caseB.createdAt,
          alert: caseB.alert,
          dataContext: caseB.dataContext,
          networkContext: caseB.networkContext,
          identityContext: caseB.identityContext,
        },
        businessContext: caseB.businessContext,
        checklist: analyzed.checklist,
        humanReview: caseB.humanReview,
        timeline: caseB.timeline,
      },
      reportDraft: null,
      createdAt: caseB.createdAt,
      updatedAt: "2026-08-09T12:00:00.000Z",
      closedAt: null,
    };

    const refreshed = refreshCaseComplianceRuntimeFromGraph(record, packGraph, {
      capturedAt: "2026-08-09T12:00:00.000Z",
    });
    expect(refreshed.views.panel.totalCount).toBeGreaterThan(0);
    expect(refreshed.meta.hitRuleIds.length).toBeGreaterThan(0);
  });

  it("CONTEXT_MODEL_GAPS 记录 operator / account owner 等缺口", () => {
    expect(CONTEXT_MODEL_GAPS.length).toBe(5);
    expect(CONTEXT_MODEL_GAPS.map((g) => g.gapId)).toEqual([
      "operator",
      "account-owner",
      "business-purpose",
      "incident-owner",
      "destination-region",
    ]);
  });
});
