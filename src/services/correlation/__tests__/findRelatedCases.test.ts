import { describe, expect, it } from "vitest";
import {
  findRelatedCases,
  normalizeCorrelationToken,
  rankRelatedCaseScore,
} from "@/services/correlation/findRelatedCases";
import type { CorrelationCaseFacts } from "@/services/correlation/types";

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

describe("findRelatedCases", () => {
  const current = facts({
    caseId: "current",
    caseNumber: "INC-CURRENT",
    username: "demo_lab_user",
    sourceIp: "198.51.100.77",
    accessedSystems: ["CRM_PROD", "HR 系统"],
    alertSource: "Wazuh",
    originalAlertId: "EXT-1",
  });

  it("same username → related", () => {
    const related = findRelatedCases(current, [
      facts({ caseId: "a", username: "demo_lab_user" }),
    ]);
    expect(related).toHaveLength(1);
    expect(related[0]!.reasons.map((r) => r.code)).toContain("SAME_USERNAME");
  });

  it("same sourceIp → related", () => {
    const related = findRelatedCases(current, [
      facts({ caseId: "b", sourceIp: "198.51.100.77" }),
    ]);
    expect(related[0]!.reasons.map((r) => r.code)).toContain("SAME_SOURCE_IP");
  });

  it("username + sourceIp → 排名高于仅系统重叠", () => {
    const related = findRelatedCases(current, [
      facts({
        caseId: "sys-only",
        accessedSystems: ["CRM_PROD"],
        lastActivityAt: "2026-08-10T18:00:00.000Z",
      }),
      facts({
        caseId: "strong",
        username: "demo_lab_user",
        sourceIp: "198.51.100.77",
        lastActivityAt: "2026-08-10T10:00:00.000Z",
      }),
    ]);
    expect(related.map((r) => r.caseId)).toEqual(["strong", "sys-only"]);
    expect(rankRelatedCaseScore(related[0]!.reasons)).toBeGreaterThan(
      rankRelatedCaseScore(related[1]!.reasons),
    );
  });

  it("shared system → related", () => {
    const related = findRelatedCases(current, [
      facts({ caseId: "c", accessedSystems: ["CRM_PROD", "ERP"] }),
    ]);
    expect(related[0]!.reasons).toEqual(
      expect.arrayContaining([
        { code: "SHARED_SYSTEM", value: "CRM_PROD" },
      ]),
    );
  });

  it("same alert source alone → 不入选", () => {
    const related = findRelatedCases(current, [
      facts({ caseId: "wazuh-only", alertSource: "Wazuh" }),
    ]);
    expect(related).toHaveLength(0);
  });

  it("null/null 与空串不匹配", () => {
    expect(normalizeCorrelationToken(null)).toBeNull();
    expect(normalizeCorrelationToken("")).toBeNull();
    expect(normalizeCorrelationToken("   ")).toBeNull();

    const related = findRelatedCases(
      facts({ caseId: "cur", username: null, sourceIp: null }),
      [
        facts({ caseId: "other", username: null, sourceIp: null }),
        facts({ caseId: "empty", username: "", sourceIp: "  " }),
      ],
    );
    expect(related).toHaveLength(0);
  });

  it("current Case 必须排除", () => {
    const related = findRelatedCases(current, [
      facts({
        caseId: "current",
        username: "demo_lab_user",
        sourceIp: "198.51.100.77",
      }),
      facts({ caseId: "other", username: "demo_lab_user" }),
    ]);
    expect(related.map((r) => r.caseId)).toEqual(["other"]);
  });

  it(">5 results → capped at 5", () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      facts({
        caseId: `c${i}`,
        caseNumber: `INC-${i}`,
        username: "demo_lab_user",
        lastActivityAt: `2026-08-10T0${i}:00:00.000Z`,
      }),
    );
    const related = findRelatedCases(current, candidates);
    expect(related).toHaveLength(5);
  });

  it("same originalAlertId → related；alert source 可作为附加 reason", () => {
    const related = findRelatedCases(current, [
      facts({
        caseId: "dup-id",
        originalAlertId: "EXT-1",
        alertSource: "Wazuh",
      }),
    ]);
    expect(related[0]!.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining([
        "SAME_EXTERNAL_ALERT_ID",
        "SAME_ALERT_SOURCE",
      ]),
    );
  });

  it("deterministic ordering：同分按 lastActivityAt / caseNumber", () => {
    const related = findRelatedCases(current, [
      facts({
        caseId: "older",
        caseNumber: "INC-B",
        username: "demo_lab_user",
        lastActivityAt: "2026-08-09T12:00:00.000Z",
      }),
      facts({
        caseId: "newer",
        caseNumber: "INC-A",
        username: "demo_lab_user",
        lastActivityAt: "2026-08-10T12:00:00.000Z",
      }),
    ]);
    expect(related.map((r) => r.caseId)).toEqual(["newer", "older"]);
  });
});
