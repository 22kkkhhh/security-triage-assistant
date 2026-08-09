/**
 * v1.4 Step 1：Knowledge Domain 枚举 / invariants / selectors。
 */
import { describe, expect, it } from "vitest";
import {
  assertClauseParentSameVersion,
  assertClauseTextForContentMode,
  assertKnownRuleId,
  assertRightsContentMode,
  assertVersionDateWindow,
  CASE_COMPLIANCE_RELEVANCES,
  COMPLIANCE_CONTROL_DOMAINS,
  COMPLIANCE_CONTROL_STATUSES,
  CONTENT_MODES,
  CONTROL_CLAUSE_RELATIONS,
  DOCUMENT_TYPES,
  KnowledgeDomainError,
  KNOWLEDGE_SOURCE_TYPES,
  LEGAL_STATUSES,
  MAPPING_REVIEW_STATUSES,
  parseEnumValue,
  PUBLICATION_STATUSES,
  resolveFindingRelevanceFromContext,
  resolveMissingContext,
  RIGHTS_STATUSES,
  RULE_CAPABILITY_STATUSES,
  RULE_CONTROL_RELATIONS,
  RULE_SOURCE_TYPES,
  selectApplicableVersionAt,
  selectCurrentApplicableVersion,
  VERSION_SELECTION_BASES,
  type VersionSelectCandidate,
} from "@/domain/knowledge";

function expectInvalidEnum(
  value: unknown,
  allowed: readonly string[],
  field: string,
) {
  expect(() => parseEnumValue(value, allowed, field)).toThrow(
    KnowledgeDomainError,
  );
}

describe("Knowledge Domain enums", () => {
  it("DocumentType / Publication / Legal / Source / Rights / ContentMode", () => {
    expect(parseEnumValue("LAW", DOCUMENT_TYPES, "documentType")).toBe("LAW");
    expectInvalidEnum("PDF", DOCUMENT_TYPES, "documentType");
    expect(parseEnumValue("PUBLISHED", PUBLICATION_STATUSES, "p")).toBe(
      "PUBLISHED",
    );
    expectInvalidEnum("LIVE", PUBLICATION_STATUSES, "p");
    expect(parseEnumValue("SUPERSEDED", LEGAL_STATUSES, "l")).toBe("SUPERSEDED");
    expect(parseEnumValue("OFFICIAL_PUBLIC", KNOWLEDGE_SOURCE_TYPES, "s")).toBe(
      "OFFICIAL_PUBLIC",
    );
    expect(parseEnumValue("UNKNOWN", RIGHTS_STATUSES, "r")).toBe("UNKNOWN");
    expect(parseEnumValue("SUMMARY_ONLY", CONTENT_MODES, "c")).toBe(
      "SUMMARY_ONLY",
    );
  });

  it("Control / Rule / Mapping / Case runtime enums", () => {
    expect(parseEnumValue("PRIVACY", COMPLIANCE_CONTROL_DOMAINS, "d")).toBe(
      "PRIVACY",
    );
    expect(parseEnumValue("ACTIVE", COMPLIANCE_CONTROL_STATUSES, "s")).toBe(
      "ACTIVE",
    );
    expect(parseEnumValue("SUPPORTED", RULE_CAPABILITY_STATUSES, "c")).toBe(
      "SUPPORTED",
    );
    expect(parseEnumValue("SIGMA", RULE_SOURCE_TYPES, "s")).toBe("SIGMA");
    expect(parseEnumValue("PRIMARY", RULE_CONTROL_RELATIONS, "r")).toBe(
      "PRIMARY",
    );
    expect(
      parseEnumValue("CONTROL_SUPPORT", CONTROL_CLAUSE_RELATIONS, "r"),
    ).toBe("CONTROL_SUPPORT");
    expectInvalidEnum(
      "INSUFFICIENT_CONTEXT",
      CONTROL_CLAUSE_RELATIONS,
      "relationType",
    );
    expect(parseEnumValue("APPROVED", MAPPING_REVIEW_STATUSES, "m")).toBe(
      "APPROVED",
    );
    expect(
      parseEnumValue("INSUFFICIENT_CONTEXT", CASE_COMPLIANCE_RELEVANCES, "rel"),
    ).toBe("INSUFFICIENT_CONTEXT");
    expect(parseEnumValue("CASE_DATE", VERSION_SELECTION_BASES, "b")).toBe(
      "CASE_DATE",
    );
  });
});

describe("Rights / contentMode invariant", () => {
  it("UNKNOWN + FULL_TEXT → reject", () => {
    expect(() => assertRightsContentMode("UNKNOWN", "FULL_TEXT")).toThrow(
      /UNKNOWN/,
    );
  });

  it("UNKNOWN + SUMMARY_ONLY / METADATA_ONLY → allow", () => {
    expect(() => assertRightsContentMode("UNKNOWN", "SUMMARY_ONLY")).not.toThrow();
    expect(() =>
      assertRightsContentMode("UNKNOWN", "METADATA_ONLY"),
    ).not.toThrow();
  });

  it("PUBLIC + FULL_TEXT → allow；OFFICIAL_PUBLIC 不自动等于 PUBLIC", () => {
    expect(() => assertRightsContentMode("PUBLIC", "FULL_TEXT")).not.toThrow();
    // SourceType 与 RightsStatus 分离：仅校验 rights+mode
    expect(KNOWLEDGE_SOURCE_TYPES).toContain("OFFICIAL_PUBLIC");
    expect(RIGHTS_STATUSES).toContain("PUBLIC");
  });
});

describe("Version date window", () => {
  it("effective < expiry → valid；同日 / 倒置 → invalid；null expiry → valid", () => {
    expect(() =>
      assertVersionDateWindow("2021-09-01", "2025-01-01"),
    ).not.toThrow();
    expect(() => assertVersionDateWindow("2021-09-01", null)).not.toThrow();
    expect(() =>
      assertVersionDateWindow("2025-01-01", "2025-01-01"),
    ).toThrow(/半开区间/);
    expect(() =>
      assertVersionDateWindow("2025-01-01", "2024-01-01"),
    ).toThrow(/半开区间/);
  });
});

describe("Historical version selection", () => {
  const versions: VersionSelectCandidate[] = [
    {
      id: "v1",
      publicationStatus: "PUBLISHED",
      effectiveDate: "2021-09-01",
      expiryDate: "2025-01-01",
      legalStatus: "SUPERSEDED",
    },
    {
      id: "v2",
      publicationStatus: "PUBLISHED",
      effectiveDate: "2025-01-01",
      expiryDate: null,
      legalStatus: "EFFECTIVE",
    },
  ];

  it("案件日期 2024-06-01 → V1（不因 SUPERSEDED 排除）", () => {
    expect(selectApplicableVersionAt(versions, "2024-06-01")?.id).toBe("v1");
  });

  it("案件日期 2025-06-01 → V2", () => {
    expect(selectApplicableVersionAt(versions, "2025-06-01")?.id).toBe("v2");
  });

  it("DRAFT 不进入正式 selector", () => {
    const withDraft: VersionSelectCandidate[] = [
      {
        id: "draft",
        publicationStatus: "DRAFT",
        effectiveDate: "2020-01-01",
        expiryDate: null,
        legalStatus: "EFFECTIVE",
      },
      ...versions,
    ];
    expect(selectApplicableVersionAt(withDraft, "2024-06-01")?.id).toBe("v1");
  });

  it("selectCurrentApplicableVersion 使用 now，不假设案件日期", () => {
    expect(selectCurrentApplicableVersion(versions, "2025-06-01")?.id).toBe(
      "v2",
    );
  });
});

describe("Clause hierarchy / text rights", () => {
  it("同版本 parent 允许；跨版本 parent 拒绝", () => {
    expect(() =>
      assertClauseParentSameVersion({
        clauseDocumentVersionId: "ver-a",
        parentClauseId: "p1",
        parentDocumentVersionId: "ver-a",
      }),
    ).not.toThrow();
    expect(() =>
      assertClauseParentSameVersion({
        clauseDocumentVersionId: "ver-a",
        parentClauseId: "p1",
        parentDocumentVersionId: "ver-b",
      }),
    ).toThrow(/同一 documentVersion/);
  });

  it("SUMMARY_ONLY / METADATA_ONLY 不得带 originalText", () => {
    expect(() =>
      assertClauseTextForContentMode("FULL_TEXT", "第1条 示例"),
    ).not.toThrow();
    expect(() =>
      assertClauseTextForContentMode("SUMMARY_ONLY", "偷偷全文"),
    ).toThrow(/SUMMARY_ONLY/);
    expect(() =>
      assertClauseTextForContentMode("METADATA_ONLY", "偷偷全文"),
    ).toThrow(/METADATA_ONLY/);
  });
});

describe("Missing context / finding relevance helper", () => {
  const reqs = [
    { key: "dataCategory", label: "数据类型" },
    { key: "destinationRegion", label: "目的地区域" },
  ];

  it("resolveMissingContext 仅按 key 存在性", () => {
    expect(resolveMissingContext(reqs, ["dataCategory"]).map((r) => r.key)).toEqual(
      ["destinationRegion"],
    );
    expect(resolveMissingContext(reqs, ["dataCategory", "destinationRegion"])).toEqual(
      [],
    );
  });

  it("缺上下文 → INSUFFICIENT_CONTEXT；齐全 → RELEVANT", () => {
    expect(resolveFindingRelevanceFromContext(reqs, ["dataCategory"])).toBe(
      "INSUFFICIENT_CONTEXT",
    );
    expect(
      resolveFindingRelevanceFromContext(reqs, [
        "dataCategory",
        "destinationRegion",
      ]),
    ).toBe("RELEVANT");
  });
});

describe("Rule id helper", () => {
  it("未知 ruleId → reject", () => {
    expect(() => assertKnownRuleId("RULE_TEST_001", ["DATA-001"])).toThrow(
      /Registry/,
    );
    expect(() => assertKnownRuleId("DATA-001", ["DATA-001"])).not.toThrow();
  });
});
