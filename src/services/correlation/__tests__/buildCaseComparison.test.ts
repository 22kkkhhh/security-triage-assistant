import { describe, expect, it } from "vitest";
import {
  buildCaseComparison,
  type ComparisonCaseSource,
} from "@/services/correlation/buildCaseComparison";
import type { CorrelationCaseFacts } from "@/services/correlation/types";
import type {
  AlertInfo,
  BusinessContext,
  DataContext,
  IdentityContext,
  NetworkContext,
} from "@/domain/types";

function facts(
  partial: Partial<CorrelationCaseFacts> & Pick<CorrelationCaseFacts, "caseId">,
): CorrelationCaseFacts {
  return {
    caseNumber: partial.caseNumber ?? `INC-${partial.caseId}`,
    title: partial.title ?? `Case ${partial.caseId}`,
    status: partial.status ?? "INVESTIGATING",
    suggestedRiskLevel: partial.suggestedRiskLevel ?? "MEDIUM",
    humanRiskLevel: partial.humanRiskLevel ?? null,
    lastActivityAt: partial.lastActivityAt ?? "2026-08-10T12:00:00.000Z",
    username: partial.username ?? null,
    sourceIp: partial.sourceIp ?? null,
    accessedSystems: partial.accessedSystems ?? [],
    alertSource: partial.alertSource ?? null,
    originalAlertId: partial.originalAlertId ?? null,
    caseId: partial.caseId,
  };
}

function emptyAlert(overrides: Partial<AlertInfo> = {}): AlertInfo {
  return {
    title: "t",
    source: overrides.source ?? "",
    severity: overrides.severity ?? null,
    occurredAt: overrides.occurredAt ?? null,
    description: "",
    originalAlertId: overrides.originalAlertId ?? null,
  };
}

function emptyIdentity(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    identityStatus: "UNKNOWN",
    accountName: overrides.accountName ?? null,
    failedLoginAttempts: null,
    successfulLogin: null,
    loginFromUnseenSource: "UNKNOWN",
    loginSourceIp: overrides.loginSourceIp ?? null,
    accessedSystems: overrides.accessedSystems ?? [],
    note: null,
  };
}

function emptyNetwork(overrides: Partial<NetworkContext> = {}): NetworkContext {
  return {
    networkStatus: "UNKNOWN",
    internalSourceIp: overrides.internalSourceIp ?? null,
    externalCommunication: overrides.externalCommunication ?? "UNKNOWN",
    externalDestination: overrides.externalDestination ?? null,
    outboundTransferBytes: null,
    note: null,
  };
}

function emptyData(overrides: Partial<DataContext> = {}): DataContext {
  return {
    accessStatus: "UNKNOWN",
    databaseName: overrides.databaseName ?? null,
    tableName: overrides.tableName ?? null,
    accessedRecordCount: overrides.accessedRecordCount ?? null,
    sensitiveFieldTypes: overrides.sensitiveFieldTypes ?? [],
    operationType: overrides.operationType ?? null,
    outsideBusinessHours: "UNKNOWN",
    baseline: null,
    note: null,
  };
}

function emptyBusiness(overrides: Partial<BusinessContext> = {}): BusinessContext {
  return {
    plannedTaskStatus: overrides.plannedTaskStatus ?? "UNKNOWN",
    changeTicketStatus: overrides.changeTicketStatus ?? "UNKNOWN",
    changeTicketId: overrides.changeTicketId ?? null,
    businessOwner: overrides.businessOwner ?? null,
    ownerVerification: overrides.ownerVerification ?? "UNKNOWN",
    businessLegitimacy: overrides.businessLegitimacy ?? "UNKNOWN",
    businessJustification: null,
  };
}

function source(
  partial: Partial<ComparisonCaseSource> &
    Pick<ComparisonCaseSource, "id" | "correlationFacts">,
): ComparisonCaseSource {
  const cf = partial.correlationFacts;
  return {
    id: partial.id,
    caseNumber: partial.caseNumber ?? cf.caseNumber,
    title: partial.title ?? cf.title,
    status: partial.status ?? cf.status,
    hasReport: partial.hasReport ?? false,
    suggestedRiskLevel: partial.suggestedRiskLevel ?? cf.suggestedRiskLevel,
    humanRiskLevel: partial.humanRiskLevel ?? cf.humanRiskLevel,
    alert:
      partial.alert ??
      emptyAlert({
        source: cf.alertSource ?? "",
        originalAlertId: cf.originalAlertId,
      }),
    identity:
      partial.identity ??
      emptyIdentity({
        accountName: cf.username,
        loginSourceIp: cf.sourceIp,
        accessedSystems: cf.accessedSystems,
      }),
    network: partial.network ?? emptyNetwork(),
    data: partial.data ?? emptyData(),
    business: partial.business ?? emptyBusiness(),
    suggestedAssessment: partial.suggestedAssessment ?? null,
    humanReview: partial.humanReview ?? null,
    correlationFacts: cf,
  };
}

describe("buildCaseComparison", () => {
  it("same username → shared", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({ caseId: "c", username: "demo_lab_user" }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({ caseId: "r", username: "demo_lab_user" }),
      }),
    });
    expect(view.stronglyRelated).toBe(true);
    expect(view.sharedFacts.map((f) => f.code)).toContain("SAME_USERNAME");
  });

  it("same source IP → shared", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({ caseId: "c", sourceIp: "198.51.100.77" }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({ caseId: "r", sourceIp: "198.51.100.77" }),
      }),
    });
    expect(view.sharedFacts.map((f) => f.code)).toContain("SAME_SOURCE_IP");
  });

  it("overlapping system → shared", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          accessedSystems: ["CRM_PROD", "HR"],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          accessedSystems: ["CRM_PROD", "ERP"],
        }),
      }),
    });
    expect(
      view.sharedFacts.filter((f) => f.code === "SHARED_SYSTEM").map((f) => f.value),
    ).toContain("CRM_PROD");
    const systemsDiff = view.differentFacts.find(
      (d) => d.fieldCode === "ACCESSED_SYSTEMS",
    );
    expect(systemsDiff).toBeTruthy();
  });

  it("same externalAlertId → shared", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          originalAlertId: "EXT-1",
          username: "u",
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          originalAlertId: "EXT-1",
          username: "u",
        }),
      }),
    });
    expect(view.sharedFacts.map((f) => f.code)).toContain(
      "SAME_EXTERNAL_ALERT_ID",
    );
  });

  it("null/null → not shared and not difference", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          username: null,
          sourceIp: null,
          accessedSystems: ["CRM_PROD"],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          username: null,
          sourceIp: null,
          accessedSystems: ["CRM_PROD"],
        }),
      }),
    });
    expect(view.sharedFacts.map((f) => f.code)).not.toContain("SAME_USERNAME");
    expect(view.sharedFacts.map((f) => f.code)).not.toContain("SAME_SOURCE_IP");
    expect(
      view.differentFacts.find((d) => d.fieldCode === "USERNAME"),
    ).toBeUndefined();
  });

  it("null/value → difference only", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          username: null,
          accessedSystems: ["CRM_PROD"],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          username: "demo_lab_user",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
    });
    const usernameDiff = view.differentFacts.find(
      (d) => d.fieldCode === "USERNAME",
    );
    expect(usernameDiff).toEqual({
      fieldCode: "USERNAME",
      category: "IDENTITY",
      currentValue: null,
      relatedValue: "demo_lab_user",
    });
    expect(view.sharedFacts.map((f) => f.code)).not.toContain("SAME_USERNAME");
  });

  it("unequal username / sourceIp → difference", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          username: "alice",
          sourceIp: "198.51.100.77",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          username: "bob",
          sourceIp: "198.51.100.42",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
    });
    expect(
      view.differentFacts.find((d) => d.fieldCode === "USERNAME")?.relatedValue,
    ).toBe("bob");
    expect(
      view.differentFacts.find((d) => d.fieldCode === "SOURCE_IP")?.relatedValue,
    ).toBe("198.51.100.42");
  });

  it("compare case to itself → stable reject shape", () => {
    const one = source({
      id: "c",
      correlationFacts: facts({ caseId: "c", username: "u" }),
    });
    const view = buildCaseComparison({ current: one, related: one });
    expect(view.sameCase).toBe(true);
    expect(view.stronglyRelated).toBe(false);
    expect(view.sharedFacts).toEqual([]);
    expect(view.differentFacts).toEqual([]);
  });

  it("no strong correlation → stronglyRelated false（source-only）", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          alertSource: "Wazuh",
          username: null,
          sourceIp: null,
          accessedSystems: [],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          alertSource: "Wazuh",
          username: null,
          sourceIp: null,
          accessedSystems: [],
        }),
      }),
    });
    expect(view.stronglyRelated).toBe(false);
    expect(view.correlationReasons).toEqual([]);
  });

  it("historical risk / HumanReview do not mutate current summary", () => {
    const view = buildCaseComparison({
      current: source({
        id: "c",
        humanRiskLevel: "LOW",
        suggestedRiskLevel: "LOW",
        humanReview: {
          reviewer: "analyst",
          finalConclusion: "INCONCLUSIVE",
          humanRiskLevel: "LOW",
          conclusionNote: null,
          adjustments: [],
          confirmedAt: null,
        },
        correlationFacts: facts({
          caseId: "c",
          accessedSystems: ["CRM_PROD"],
          humanRiskLevel: "LOW",
          suggestedRiskLevel: "LOW",
        }),
      }),
      related: source({
        id: "r",
        humanRiskLevel: "CRITICAL",
        suggestedRiskLevel: "CRITICAL",
        humanReview: {
          reviewer: "other",
          finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
          humanRiskLevel: "CRITICAL",
          conclusionNote: "历史结论",
          adjustments: [],
          confirmedAt: "2026-08-01T00:00:00.000Z",
        },
        correlationFacts: facts({
          caseId: "r",
          accessedSystems: ["CRM_PROD"],
          humanRiskLevel: "CRITICAL",
          suggestedRiskLevel: "CRITICAL",
        }),
      }),
    });
    expect(view.current.humanRiskLevel).toBe("LOW");
    expect(view.current.humanConclusion).toBe("INCONCLUSIVE");
    expect(view.related.humanRiskLevel).toBe("CRITICAL");
    expect(view.related.humanConclusion).toBe("SUSPECTED_SECURITY_INCIDENT");
  });

  it("deterministic output order", () => {
    const a = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          username: "u",
          sourceIp: "198.51.100.77",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          username: "u",
          sourceIp: "198.51.100.77",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
    });
    const b = buildCaseComparison({
      current: source({
        id: "c",
        correlationFacts: facts({
          caseId: "c",
          username: "u",
          sourceIp: "198.51.100.77",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
      related: source({
        id: "r",
        correlationFacts: facts({
          caseId: "r",
          username: "u",
          sourceIp: "198.51.100.77",
          accessedSystems: ["CRM_PROD"],
        }),
      }),
    });
    expect(a).toEqual(b);
  });
});
