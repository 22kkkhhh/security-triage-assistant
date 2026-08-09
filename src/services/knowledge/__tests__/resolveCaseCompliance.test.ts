/**
 * v1.4 Step 2B：Runtime Compliance Resolution 测试。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type {
  ComplianceClause,
  ComplianceControl,
  ComplianceDocument,
  ComplianceDocumentVersion,
  ControlClauseMapping,
  RuleControlMapping,
} from "@/domain/knowledge";
import type { AnalysisResult, SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { resetPrismaClient } from "@/lib/prisma";
import { importCuratedKnowledgePack } from "@/services/knowledge/pack/importCuratedKnowledgePack";
import {
  collectAvailableContextKeys,
  collectHitRuleIds,
  resolveCaseCompliance,
  resolveCaseComplianceFromGraph,
  resolveFindingRelevance,
  type KnowledgeResolutionGraph,
} from "@/services/knowledge/resolveCaseCompliance";

const TEST_DB = path.resolve("prisma/test-resolve-case-compliance.db");
const TEST_URL = `file:${TEST_DB.replace(/\\/g, "/")}`;

function cleanDb() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${TEST_DB}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

function isoDay(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function buildHistoricalGraph(): KnowledgeResolutionGraph {
  const document: ComplianceDocument = {
    id: "doc-hist",
    canonicalCode: "TEST-HIST-DOC",
    title: "测试历史版本法规",
    documentType: "LAW",
    jurisdiction: "CN-TEST",
    issuingAuthority: "测试",
    description: null,
    createdAt: isoDay("2021-01-01"),
    updatedAt: isoDay("2025-01-01"),
  };

  const v1: ComplianceDocumentVersion = {
    id: "ver-v1",
    documentId: document.id,
    versionKey: "2021-original",
    versionLabel: "2021",
    documentNumber: null,
    publishDate: isoDay("2021-09-01"),
    effectiveDate: isoDay("2021-09-01"),
    expiryDate: isoDay("2025-01-01"),
    publicationStatus: "PUBLISHED",
    legalStatus: "SUPERSEDED",
    sourceType: "OTHER",
    sourceUrl: "https://example.test/v1",
    rightsStatus: "PUBLIC",
    contentMode: "FULL_TEXT",
    sourceFileName: null,
    sourceFileHash: null,
    createdAt: isoDay("2021-09-01"),
    updatedAt: isoDay("2025-01-01"),
    reviewedAt: isoDay("2021-09-01"),
    publishedAt: isoDay("2021-09-01"),
  };

  const v2: ComplianceDocumentVersion = {
    id: "ver-v2",
    documentId: document.id,
    versionKey: "2025-revision",
    versionLabel: "2025",
    documentNumber: null,
    publishDate: isoDay("2025-01-01"),
    effectiveDate: isoDay("2025-01-01"),
    expiryDate: null,
    publicationStatus: "PUBLISHED",
    legalStatus: "EFFECTIVE",
    sourceType: "OTHER",
    sourceUrl: "https://example.test/v2",
    rightsStatus: "PUBLIC",
    contentMode: "FULL_TEXT",
    sourceFileName: null,
    sourceFileHash: null,
    createdAt: isoDay("2025-01-01"),
    updatedAt: isoDay("2025-01-01"),
    reviewedAt: isoDay("2025-01-01"),
    publishedAt: isoDay("2025-01-01"),
  };

  const clauseV1: ComplianceClause = {
    id: "clause-v1",
    documentVersionId: v1.id,
    clauseKey: "article-1",
    articleNumber: "第1条",
    chapter: null,
    section: null,
    heading: "历史版本条款",
    parentClauseId: null,
    originalText: "第1条 示例文本（V1）",
    summary: "V1 summary",
    interpretation: null,
    topics: ["access-control"],
    sortOrder: 1,
    createdAt: isoDay("2021-09-01"),
    updatedAt: isoDay("2021-09-01"),
  };

  const clauseV2: ComplianceClause = {
    id: "clause-v2",
    documentVersionId: v2.id,
    clauseKey: "article-1",
    articleNumber: "第1条",
    chapter: null,
    section: null,
    heading: "现行版本条款",
    parentClauseId: null,
    originalText: "第1条 示例文本（V2）",
    summary: "V2 summary",
    interpretation: null,
    topics: ["access-control"],
    sortOrder: 1,
    createdAt: isoDay("2025-01-01"),
    updatedAt: isoDay("2025-01-01"),
  };

  const control: ComplianceControl = {
    id: "ctrl-1",
    controlCode: "TEST-CTRL-ACCESS",
    title: "测试访问控制",
    domain: "DATA",
    description: "测试",
    objectives: null,
    requiredContext: [],
    suggestedEvidence: [{ key: "e1", label: "证据1" }],
    suggestedChecklistItems: [{ key: "c1", label: "核查1" }],
    status: "ACTIVE",
    createdAt: isoDay("2025-01-01"),
    updatedAt: isoDay("2025-01-01"),
  };

  const rc: RuleControlMapping = {
    id: "rc-1",
    ruleId: "DATA-001",
    controlId: control.id,
    relation: "PRIMARY",
    rationale: "测试 RC",
    requiredContext: [],
    priority: 10,
    createdAt: isoDay("2025-01-01"),
    updatedAt: isoDay("2025-01-01"),
  };

  const ccSupport: ControlClauseMapping = {
    id: "cc-1",
    controlId: control.id,
    clauseId: clauseV2.id, // mapping 挂在当前包版本；运行时按 clauseKey 解析到适用版本
    relationType: "CONTROL_SUPPORT",
    rationale: "控制支撑",
    requiredContext: [],
    suggestedEvidence: [],
    suggestedChecklistItems: [],
    reviewStatus: "APPROVED",
    reviewedAt: isoDay("2025-01-01"),
    createdAt: isoDay("2025-01-01"),
    updatedAt: isoDay("2025-01-01"),
  };

  const ccPossible: ControlClauseMapping = {
    id: "cc-2",
    controlId: control.id,
    clauseId: clauseV2.id,
    relationType: "POSSIBLE_OBLIGATION",
    rationale: "可能义务（需目的地）",
    requiredContext: [{ key: "destinationRegion", label: "目的地区域" }],
    suggestedEvidence: [],
    suggestedChecklistItems: [],
    reviewStatus: "APPROVED",
    reviewedAt: isoDay("2025-01-01"),
    createdAt: isoDay("2025-01-01"),
    updatedAt: isoDay("2025-01-01"),
  };

  const versionsByVersionKey = new Map<string, Map<string, ComplianceClause>>([
    [v1.id, new Map([[clauseV1.clauseKey, clauseV1]])],
    [v2.id, new Map([[clauseV2.clauseKey, clauseV2]])],
  ]);

  return {
    documentsById: new Map([[document.id, document]]),
    versionsById: new Map([
      [v1.id, v1],
      [v2.id, v2],
    ]),
    versionsByDocumentId: new Map([[document.id, [v1, v2]]]),
    clausesById: new Map([
      [clauseV1.id, clauseV1],
      [clauseV2.id, clauseV2],
    ]),
    clausesByVersionKey: versionsByVersionKey,
    controlsById: new Map([[control.id, control]]),
    ruleControlByRuleId: new Map([["DATA-001", [rc]]]),
    controlClauseByControlId: new Map([
      [control.id, [ccSupport, ccPossible]],
    ]),
  };
}

function hitResult(
  ruleId: string,
  status: AnalysisResult["status"] = "ABNORMAL",
  evidenceIds: string[] = [`${ruleId}-E1`],
): AnalysisResult {
  return {
    ruleId,
    category: "DATA",
    status,
    riskLevel: status === "UNKNOWN" ? null : "HIGH",
    title: ruleId,
    explanation: "test",
    evidenceIds,
    verificationActions: [],
  };
}

function draftWithDate(
  day: string,
  overrides: Partial<SecurityCaseDraft> = {},
): SecurityCaseDraft {
  return {
    ...caseA,
    ...overrides,
    alert: {
      ...caseA.alert,
      occurredAt: `${day}T12:00:00.000Z`,
      ...(overrides.alert ?? {}),
    },
    networkContext: {
      ...caseA.networkContext,
      externalDestination: null,
      outboundTransferBytes: null,
      ...(overrides.networkContext ?? {}),
    },
  };
}

describe("resolveFindingRelevance 保守策略", () => {
  it("CONTROL_SUPPORT → RELEVANT；有 evidence 仍不升 DIRECT", () => {
    expect(
      resolveFindingRelevance({
        relationType: "CONTROL_SUPPORT",
        missingContext: [],
        evidenceIds: ["e1"],
      }),
    ).toBe("RELEVANT");
  });

  it("POSSIBLE_OBLIGATION → POSSIBLE", () => {
    expect(
      resolveFindingRelevance({
        relationType: "POSSIBLE_OBLIGATION",
        missingContext: [],
        evidenceIds: [],
      }),
    ).toBe("POSSIBLE");
  });

  it("缺上下文 → INSUFFICIENT_CONTEXT", () => {
    expect(
      resolveFindingRelevance({
        relationType: "CONTROL_SUPPORT",
        missingContext: [{ key: "x", label: "X" }],
        evidenceIds: ["e1"],
      }),
    ).toBe("INSUFFICIENT_CONTEXT");
  });
});

describe("resolveCaseComplianceFromGraph（纯函数）", () => {
  const graph = buildHistoricalGraph();
  const known = new Set(["DATA-001", "DATA-002", "NETWORK-001"]);

  it("Case date 选 SUPERSEDED 历史版本 V1", () => {
    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2024-06-01"),
        analysisResults: [hitResult("DATA-001")],
        knownRuleIds: known,
        capturedAt: "2026-08-09T00:00:00.000Z",
      },
      graph,
    );
    expect(result.versionSelectionBasis).toBe("CASE_DATE");
    expect(result.caseDate).toBe("2024-06-01");
    const support = result.findings.find(
      (f) => f.relationType === "CONTROL_SUPPORT",
    );
    expect(support?.versionKey).toBe("2021-original");
    expect(support?.documentVersionId).toBe("ver-v1");
    expect(support?.clauseId).toBe("clause-v1");
    expect(support?.relevance).toBe("RELEVANT");
  });

  it("较新 Case date 选 V2 EFFECTIVE", () => {
    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2025-06-01"),
        analysisResults: [hitResult("DATA-001")],
        knownRuleIds: known,
      },
      graph,
    );
    const support = result.findings.find(
      (f) => f.relationType === "CONTROL_SUPPORT",
    );
    expect(support?.versionKey).toBe("2025-revision");
    expect(support?.clauseId).toBe("clause-v2");
  });

  it("POSSIBLE_OBLIGATION 且缺 destinationRegion → INSUFFICIENT_CONTEXT", () => {
    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2025-06-01"),
        analysisResults: [hitResult("DATA-001")],
        knownRuleIds: known,
      },
      graph,
    );
    const possible = result.findings.find(
      (f) => f.relationType === "POSSIBLE_OBLIGATION",
    );
    expect(possible?.relevance).toBe("INSUFFICIENT_CONTEXT");
    expect(possible?.missingContext.some((m) => m.key === "destinationRegion")).toBe(
      true,
    );
  });

  it("POSSIBLE_OBLIGATION 上下文齐全 → POSSIBLE", () => {
    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2025-06-01", {
          networkContext: {
            ...caseA.networkContext,
            externalDestination: "203.0.113.10",
            outboundTransferBytes: 1000,
          },
        }),
        analysisResults: [hitResult("DATA-001")],
        knownRuleIds: known,
      },
      graph,
    );
    const possible = result.findings.find(
      (f) => f.relationType === "POSSIBLE_OBLIGATION",
    );
    expect(possible?.relevance).toBe("POSSIBLE");
  });

  it("多 rule 命中同一 control/clause → 去重并保留 supportingRuleIds/evidence", () => {
    const graphMulti: KnowledgeResolutionGraph = {
      ...graph,
      ruleControlByRuleId: new Map([
        [
          "DATA-001",
          [
            {
              id: "rc-1",
              ruleId: "DATA-001",
              controlId: "ctrl-1",
              relation: "PRIMARY",
              rationale: null,
              requiredContext: [],
              priority: 10,
              createdAt: isoDay("2025-01-01"),
              updatedAt: isoDay("2025-01-01"),
            },
          ],
        ],
        [
          "DATA-002",
          [
            {
              id: "rc-2",
              ruleId: "DATA-002",
              controlId: "ctrl-1",
              relation: "SUPPORTING",
              rationale: null,
              requiredContext: [],
              priority: 20,
              createdAt: isoDay("2025-01-01"),
              updatedAt: isoDay("2025-01-01"),
            },
          ],
        ],
      ]),
    };

    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2025-06-01"),
        analysisResults: [
          hitResult("DATA-001", "ABNORMAL", ["DATA-001-E1"]),
          hitResult("DATA-002", "ABNORMAL", ["DATA-002-E1"]),
        ],
        knownRuleIds: known,
      },
      graphMulti,
    );

    const supportFindings = result.findings.filter(
      (f) => f.relationType === "CONTROL_SUPPORT",
    );
    expect(supportFindings).toHaveLength(1);
    expect(supportFindings[0]?.ruleId).toBe("DATA-001");
    expect(supportFindings[0]?.supportingRuleIds).toEqual(["DATA-002"]);
    expect(supportFindings[0]?.evidenceIds).toEqual([
      "DATA-001-E1",
      "DATA-002-E1",
    ]);
  });

  it("无相关 hit rule → 空 findings", () => {
    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2025-06-01"),
        analysisResults: [
          hitResult("DATA-001", "NORMAL", []),
        ],
        knownRuleIds: known,
      },
      graph,
    );
    expect(result.hitRuleIds).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.snapshots).toEqual([]);
  });

  it("unknown rule 防御：跳过且不抛错", () => {
    const { skippedUnknownRuleIds } = collectHitRuleIds(
      [hitResult("RULE_NOT_REGISTERED")],
      known,
    );
    expect(skippedUnknownRuleIds).toEqual(["RULE_NOT_REGISTERED"]);

    const result = resolveCaseComplianceFromGraph(
      {
        draft: draftWithDate("2025-06-01"),
        analysisResults: [
          hitResult("RULE_NOT_REGISTERED"),
          hitResult("DATA-001"),
        ],
        knownRuleIds: known,
      },
      graph,
    );
    expect(result.skippedUnknownRuleIds).toContain("RULE_NOT_REGISTERED");
    expect(result.hitRuleIds).toEqual(["DATA-001"]);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("Snapshot 固定 caseDate / versionKey / clauseKey，二次解析稳定", () => {
    const input = {
      draft: draftWithDate("2024-06-01"),
      analysisResults: [hitResult("DATA-001")],
      knownRuleIds: known,
      capturedAt: "2026-08-09T12:00:00.000Z",
    };
    const a = resolveCaseComplianceFromGraph(input, graph);
    const b = resolveCaseComplianceFromGraph(input, graph);
    expect(a.snapshots).toEqual(b.snapshots);
    const snap = a.snapshots.find((s) => s.relationType === "CONTROL_SUPPORT");
    expect(snap).toMatchObject({
      caseDate: "2024-06-01",
      versionSelectionBasis: "CASE_DATE",
      documentCanonicalCode: "TEST-HIST-DOC",
      versionKey: "2021-original",
      clauseKey: "article-1",
      capturedAt: "2026-08-09T12:00:00.000Z",
    });
  });
});

describe("Case A/B + curated pack（DB）", () => {
  beforeAll(async () => {
    cleanDb();
    process.env.DATABASE_URL = TEST_URL;
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_URL },
      stdio: "pipe",
    });
    await resetPrismaClient(TEST_URL);
    await importCuratedKnowledgePack();
  }, 60_000);

  afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    cleanDb();
  });

  it("Case A：有 findings，不含违法结论措辞；业务授权上下文不消除关联", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const hitAbnormal = analyzed.analysisResults.filter(
      (r) => r.status === "ABNORMAL",
    );
    expect(hitAbnormal.length).toBeGreaterThan(0);

    const result = await resolveCaseCompliance({
      draft: caseA,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      capturedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(result.caseDate).toBe("2026-08-08");
    expect(result.versionSelectionBasis).toBe("CASE_DATE");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.snapshots.length).toBe(result.findings.length);
    for (const f of result.findings) {
      expect(f.rationale).not.toMatch(/已违法|确认泄露|黑客入侵/);
      expect(["RELEVANT", "POSSIBLE", "INSUFFICIENT_CONTEXT"]).toContain(
        f.relevance,
      );
      expect(f.relevance).not.toBe("DIRECT");
      expect(f.versionKey.length).toBeGreaterThan(0);
      expect(f.caseDate).toBe(result.caseDate);
    }
  });

  it("Case B：规则链解析出多条 findings，含 evidence provenance", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const result = await resolveCaseCompliance({
      draft: caseB,
      analysisResults: analyzed.analysisResults,
      evidences: analyzed.evidences,
      capturedAt: "2026-08-09T12:00:00.000Z",
    });

    expect(result.hitRuleIds.length).toBeGreaterThan(0);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings.some((f) => f.evidenceIds.length > 0)).toBe(true);
    expect(
      result.findings.every((f) =>
        ["CONTROL_SUPPORT", "POSSIBLE_OBLIGATION", "ESCALATION_TRIGGER"].includes(
          f.relationType,
        ),
      ),
    ).toBe(true);

    const keys = collectAvailableContextKeys(caseB);
    expect(keys).toContain("dataCategory");
    expect(keys).toContain("loginSourceIp");
  });
});
