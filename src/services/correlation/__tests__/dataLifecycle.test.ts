import { describe, expect, it } from "vitest";
import type { Evidence, SecurityCaseDraft, TimelineEvent } from "@/domain/types";
import { buildDataLifecycleProjection } from "../dataLifecycle";

const draft = (overrides: Partial<SecurityCaseDraft> = {}): SecurityCaseDraft => ({
  id: "case-1",
  name: "敏感数据查询",
  createdAt: "2026-08-28T06:00:00.000Z",
  alert: {
    title: "敏感数据访问告警",
    source: "数据库审计",
    severity: "HIGH",
    occurredAt: "2026-08-28T06:00:00.000Z",
    description: "检测到一次数据查询",
    originalAlertId: "alert-1",
  },
  dataContext: {
    accessStatus: "ABNORMAL",
    databaseName: "CRM",
    tableName: "customers",
    accessedRecordCount: 12,
    sensitiveFieldTypes: ["手机号"],
    operationType: "SELECT",
    outsideBusinessHours: "UNKNOWN",
    baseline: null,
    note: null,
  },
  networkContext: {
    networkStatus: "UNKNOWN",
    internalSourceIp: "10.0.0.8",
    externalCommunication: "UNKNOWN",
    externalDestination: null,
    outboundTransferBytes: null,
    note: null,
  },
  identityContext: {
    identityStatus: "ABNORMAL",
    accountName: "admin01",
    failedLoginAttempts: 3,
    successfulLogin: true,
    loginFromUnseenSource: "UNKNOWN",
    loginSourceIp: "10.0.0.8",
    accessedSystems: ["CRM"],
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
  humanReview: null,
  report: null,
  timeline: [],
  ...overrides,
});

const evidence: Evidence = {
  evidenceId: "evidence-1",
  relatedRuleId: "DATA_ACCESS",
  sourceType: "DATABASE_AUDIT",
  timestamp: "2026-08-28T06:00:00.000Z",
  title: "数据库查询记录",
  summary: "检测到敏感数据访问",
  analystNote: null,
  includedInReport: false,
};

const timeline: TimelineEvent = {
  id: "timeline-1",
  occurredAt: "2026-08-28T06:00:00.000Z",
  eventType: "数据访问",
  title: "查询 CRM 客户表",
  description: "admin01 从 10.0.0.8 查询敏感字段",
  operator: null,
  source: "SYSTEM",
};

describe("buildDataLifecycleProjection", () => {
  it("marks observed data use and storage and keeps provenance references", () => {
    const projection = buildDataLifecycleProjection({
      draft: draft(),
      evidences: [evidence],
      timeline: [timeline],
    });

    expect(projection.stages.find((stage) => stage.key === "USE")?.status).toBe("OBSERVED");
    expect(projection.stages.find((stage) => stage.key === "STORAGE")?.status).toBe("OBSERVED");
    expect(projection.stages.find((stage) => stage.key === "USE")?.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "EVIDENCE", id: "evidence-1" }),
        expect.objectContaining({ kind: "TIMELINE", id: "timeline-1" }),
      ]),
    );
  });

  it("does not infer export, sharing, archive, or deletion without facts", () => {
    const projection = buildDataLifecycleProjection({
      draft: draft(),
      evidences: [evidence],
      timeline: [timeline],
    });

    for (const key of ["EXPORT", "ARCHIVE", "DELETION"] as const) {
      expect(projection.stages.find((stage) => stage.key === key)?.status).toBe("NOT_OBSERVED");
    }
    expect(projection.stages.find((stage) => stage.key === "SHARING")?.status).toBe("NOT_OBSERVED");
  });

  it("marks transfer as observed only when outbound facts exist", () => {
    const projection = buildDataLifecycleProjection({
      draft: draft({
        networkContext: {
          ...draft().networkContext,
          externalCommunication: "ABNORMAL",
          externalDestination: "203.0.113.0/24",
          outboundTransferBytes: 2048,
        },
      }),
      evidences: [],
      timeline: [],
    });

    expect(projection.stages.find((stage) => stage.key === "SHARING")?.status).toBe("OBSERVED");
  });
});
