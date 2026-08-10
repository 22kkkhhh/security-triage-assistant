import { describe, expect, it } from "vitest";
import {
  aggregateHistoricalSignals,
  buildInvestigationIntelligence,
  buildInvestigationLeads,
} from "@/services/correlation/buildInvestigationIntelligence";
import { toCurrentAnalysisHints } from "@/services/correlation/currentAnalysisHints";
import type { RelatedCaseItem } from "@/services/correlation/types";
import type { AnalysisResult } from "@/domain/types";

function related(
  partial: Partial<RelatedCaseItem> &
    Pick<RelatedCaseItem, "caseId" | "reasons">,
): RelatedCaseItem {
  return {
    caseNumber: partial.caseNumber ?? `INC-${partial.caseId}`,
    title: partial.title ?? `Case ${partial.caseId}`,
    status: partial.status ?? "INVESTIGATING",
    suggestedRiskLevel: partial.suggestedRiskLevel ?? "MEDIUM",
    humanRiskLevel: partial.humanRiskLevel ?? null,
    lastActivityAt: partial.lastActivityAt ?? "2026-08-10T12:00:00.000Z",
    caseId: partial.caseId,
    reasons: partial.reasons,
  };
}

describe("buildInvestigationIntelligence", () => {
  it("0 related cases → no signals / no leads", () => {
    const view = buildInvestigationIntelligence({ relatedCases: [] });
    expect(view).toEqual({
      relatedCases: [],
      relatedCaseCount: 0,
      signals: [],
      leads: [],
    });
  });

  it("same username across 2 cases → RECURRING_USERNAME", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [{ code: "SAME_USERNAME", value: "demo_lab_user" }],
      }),
      related({
        caseId: "b",
        reasons: [{ code: "SAME_USERNAME", value: "demo_lab_user" }],
      }),
    ];
    const signals = aggregateHistoricalSignals(cases);
    expect(signals).toEqual([
      {
        code: "RECURRING_USERNAME",
        value: "demo_lab_user",
        relatedCaseCount: 2,
        relatedCaseIds: ["a", "b"],
      },
    ]);
  });

  it("same source IP across 3 cases → RECURRING_SOURCE_IP", () => {
    const ip = "198.51.100.77";
    const cases = ["a", "b", "c"].map((caseId) =>
      related({
        caseId,
        reasons: [{ code: "SAME_SOURCE_IP", value: ip }],
      }),
    );
    const signal = aggregateHistoricalSignals(cases).find(
      (s) => s.code === "RECURRING_SOURCE_IP",
    );
    expect(signal).toEqual({
      code: "RECURRING_SOURCE_IP",
      value: ip,
      relatedCaseCount: 3,
      relatedCaseIds: ["a", "b", "c"],
    });
  });

  it("shared system → RECURRING_SYSTEM", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [{ code: "SHARED_SYSTEM", value: "CRM_PROD" }],
      }),
    ];
    expect(aggregateHistoricalSignals(cases)[0]).toMatchObject({
      code: "RECURRING_SYSTEM",
      value: "CRM_PROD",
      relatedCaseCount: 1,
    });
  });

  it("repeated externalAlertId → REPEATED_EXTERNAL_ALERT_ID", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [{ code: "SAME_EXTERNAL_ALERT_ID", value: "EXT-99" }],
      }),
      related({
        caseId: "b",
        reasons: [{ code: "SAME_EXTERNAL_ALERT_ID", value: "EXT-99" }],
      }),
    ];
    expect(aggregateHistoricalSignals(cases)[0]).toMatchObject({
      code: "REPEATED_EXTERNAL_ALERT_ID",
      value: "EXT-99",
      relatedCaseCount: 2,
    });
  });

  it("SAME_ALERT_SOURCE only → no standalone historical signal", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [{ code: "SAME_ALERT_SOURCE", value: "Wazuh" }],
      }),
      related({
        caseId: "b",
        reasons: [{ code: "SAME_ALERT_SOURCE", value: "Wazuh" }],
      }),
    ];
    const view = buildInvestigationIntelligence({ relatedCases: cases });
    expect(view.signals).toEqual([]);
    // 仍有 ≥2 related → timeline lead only
    expect(view.leads.map((l) => l.code)).toEqual([
      "REVIEW_RELATED_CASE_TIMELINES",
    ]);
  });

  it("duplicate reasons from multiple cases → correctly aggregated", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [
          { code: "SAME_USERNAME", value: "demo_lab_user" },
          { code: "SAME_SOURCE_IP", value: "198.51.100.77" },
        ],
      }),
      related({
        caseId: "b",
        reasons: [
          { code: "SAME_USERNAME", value: "demo_lab_user" },
          { code: "SHARED_SYSTEM", value: "CRM_PROD" },
        ],
      }),
      related({
        caseId: "c",
        reasons: [{ code: "SAME_USERNAME", value: "demo_lab_user" }],
      }),
    ];
    const username = aggregateHistoricalSignals(cases).find(
      (s) => s.code === "RECURRING_USERNAME",
    );
    expect(username?.relatedCaseCount).toBe(3);
    expect(username?.relatedCaseIds).toEqual(["a", "b", "c"]);
  });

  it("same value case-insensitive for username / IP / system", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [{ code: "SAME_USERNAME", value: "Demo_Lab_User" }],
      }),
      related({
        caseId: "b",
        reasons: [{ code: "SAME_USERNAME", value: "demo_lab_user" }],
      }),
    ];
    const signals = aggregateHistoricalSignals(cases);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.relatedCaseCount).toBe(2);
  });

  it("lead deduplication + max 4 + deterministic order", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [
          { code: "SAME_EXTERNAL_ALERT_ID", value: "EXT-1" },
          { code: "SAME_SOURCE_IP", value: "198.51.100.77" },
          { code: "SAME_USERNAME", value: "demo_lab_user" },
          { code: "SHARED_SYSTEM", value: "CRM_PROD" },
        ],
      }),
      related({
        caseId: "b",
        reasons: [
          { code: "SAME_EXTERNAL_ALERT_ID", value: "EXT-1" },
          { code: "SAME_SOURCE_IP", value: "198.51.100.77" },
          { code: "SAME_USERNAME", value: "demo_lab_user" },
          { code: "SHARED_SYSTEM", value: "CRM_PROD" },
        ],
      }),
    ];
    const view = buildInvestigationIntelligence({ relatedCases: cases });
    const codes = view.leads.map((l) => l.code);
    expect(codes).toHaveLength(4);
    expect(new Set(codes).size).toBe(4);
    expect(codes[0]).toBe("CHECK_DUPLICATE_ALERT_PROVENANCE");
    expect(codes).toContain("VERIFY_SOURCE_IP_OWNERSHIP");
    expect(codes).toContain("VERIFY_RECURRING_ACCOUNT");
    // timeline is 5th by default base priority — capped out
    expect(codes).not.toContain("REVIEW_RELATED_CASE_TIMELINES");
  });

  it("identity abnormal hint prioritizes VERIFY_RECURRING_ACCOUNT", () => {
    const cases = [
      related({
        caseId: "a",
        reasons: [
          { code: "SAME_USERNAME", value: "u1" },
          { code: "SHARED_SYSTEM", value: "CRM_PROD" },
        ],
      }),
    ];
    const signals = aggregateHistoricalSignals(cases);
    const leads = buildInvestigationLeads(cases, signals, {
      hasIdentityAbnormal: true,
      hasNetworkAbnormal: false,
      hasDataAbnormal: false,
    });
    expect(leads[0]!.code).toBe("VERIFY_RECURRING_ACCOUNT");
  });

  it("historical risk fields are not inputs to intelligence", () => {
    const cases = [
      related({
        caseId: "crit",
        humanRiskLevel: "CRITICAL",
        suggestedRiskLevel: "CRITICAL",
        reasons: [{ code: "SHARED_SYSTEM", value: "CRM_PROD" }],
      }),
    ];
    const view = buildInvestigationIntelligence({ relatedCases: cases });
    expect(view.signals.map((s) => s.code)).toEqual(["RECURRING_SYSTEM"]);
    expect(view.leads.map((l) => l.code)).toEqual([
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
    ]);
    // intelligence 输出本身不含评分 / 概率；relatedCases 可透传展示用风险字段但不驱动 leads
    expect(JSON.stringify(view.signals)).not.toMatch(
      /CRITICAL|correlationScore|92%/,
    );
    expect(JSON.stringify(view.leads)).not.toMatch(
      /CRITICAL|correlationScore|92%/,
    );
  });


  it("toCurrentAnalysisHints reads ABNORMAL categories only", () => {
    const results: AnalysisResult[] = [
      {
        ruleId: "r1",
        category: "IDENTITY",
        status: "ABNORMAL",
        riskLevel: "HIGH",
        title: "t",
        explanation: "e",
        evidenceIds: [],
        verificationActions: [],
      },
      {
        ruleId: "r2",
        category: "NETWORK",
        status: "NORMAL",
        riskLevel: "LOW",
        title: "t",
        explanation: "e",
        evidenceIds: [],
        verificationActions: [],
      },
    ];
    expect(toCurrentAnalysisHints(results)).toEqual({
      hasIdentityAbnormal: true,
      hasNetworkAbnormal: false,
      hasDataAbnormal: false,
    });
  });
});

