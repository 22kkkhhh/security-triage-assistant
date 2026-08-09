/**
 * Security & Compliance Knowledge Center Domain（v1.4 Step 1）。
 *
 * TypeScript 枚举为 SoT；Prisma SQLite 以 String / Json 存储。
 * Executable Security Rules 仍在 analysis TS registry，不在本模块建 DB SoT。
 */

import type { SecurityDomain } from "@/domain/types";

// ---------------------------------------------------------------------------
// Document / Version
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  "LAW",
  "REGULATION",
  "DEPARTMENT_RULE",
  "STANDARD",
  "GUIDELINE",
  "INTERNAL_POLICY",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PUBLICATION_STATUSES = ["DRAFT", "REVIEWED", "PUBLISHED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const LEGAL_STATUSES = [
  "NOT_EFFECTIVE",
  "EFFECTIVE",
  "SUPERSEDED",
  "REPEALED",
] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

export const KNOWLEDGE_SOURCE_TYPES = [
  "OFFICIAL_PUBLIC",
  "USER_PROVIDED",
  "LICENSED",
  "OTHER",
] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const RIGHTS_STATUSES = [
  "PUBLIC",
  "USER_AUTHORIZED",
  "LICENSED",
  "UNKNOWN",
] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const CONTENT_MODES = [
  "FULL_TEXT",
  "SUMMARY_ONLY",
  "METADATA_ONLY",
] as const;
export type ContentMode = (typeof CONTENT_MODES)[number];

export type ComplianceDocument = {
  id: string;
  canonicalCode: string;
  title: string;
  documentType: DocumentType;
  jurisdiction: string;
  issuingAuthority: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ComplianceDocumentVersion = {
  id: string;
  documentId: string;
  versionKey: string;
  versionLabel: string;
  documentNumber: string | null;
  publishDate: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  publicationStatus: PublicationStatus;
  legalStatus: LegalStatus;
  sourceType: KnowledgeSourceType;
  sourceUrl: string | null;
  rightsStatus: RightsStatus;
  contentMode: ContentMode;
  sourceFileName: string | null;
  sourceFileHash: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  publishedAt: string | null;
};

// ---------------------------------------------------------------------------
// Clause
// ---------------------------------------------------------------------------

export type ComplianceClause = {
  id: string;
  documentVersionId: string;
  clauseKey: string;
  articleNumber: string | null;
  chapter: string | null;
  section: string | null;
  heading: string | null;
  parentClauseId: string | null;
  originalText: string | null;
  summary: string | null;
  interpretation: string | null;
  topics: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

export const COMPLIANCE_CONTROL_DOMAINS = [
  "DATA",
  "NETWORK",
  "IDENTITY",
  "BUSINESS",
  "GOVERNANCE",
  "INCIDENT_RESPONSE",
  "PRIVACY",
] as const;
export type ComplianceControlDomain =
  (typeof COMPLIANCE_CONTROL_DOMAINS)[number];

export const COMPLIANCE_CONTROL_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "RETIRED",
] as const;
export type ComplianceControlStatus =
  (typeof COMPLIANCE_CONTROL_STATUSES)[number];

export type ContextRequirement = {
  key: string;
  label: string;
  description?: string;
};

export type EvidenceSuggestion = {
  key: string;
  label: string;
  description?: string;
};

export type ChecklistSuggestion = {
  key: string;
  label: string;
  description?: string;
};

export type ComplianceControl = {
  id: string;
  controlCode: string;
  title: string;
  domain: ComplianceControlDomain;
  description: string;
  objectives: string | null;
  requiredContext: ContextRequirement[];
  suggestedEvidence: EvidenceSuggestion[];
  suggestedChecklistItems: ChecklistSuggestion[];
  status: ComplianceControlStatus;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Rule metadata (TS SoT for catalog; executable rules remain in analysis)
// ---------------------------------------------------------------------------

export const RULE_CAPABILITY_STATUSES = [
  "SUPPORTED",
  "NEEDS_CONTEXT",
  "OUT_OF_SCOPE",
] as const;
export type RuleCapabilityStatus = (typeof RULE_CAPABILITY_STATUSES)[number];

export const RULE_SOURCE_TYPES = [
  "INTERNAL",
  "SIGMA",
  "SPLUNK",
  "ELASTIC",
  "OTHER",
] as const;
export type RuleSourceType = (typeof RULE_SOURCE_TYPES)[number];

export type SecurityRuleMetadata = {
  ruleId: string;
  title: string;
  dimension: SecurityDomain;
  description: string;
  requiredFields: string[];
  sourceType: RuleSourceType;
  upstreamRuleId?: string | null;
  upstreamVersion?: string | null;
  sourceUrl?: string | null;
  licenseId?: string | null;
  licenseUrl?: string | null;
  attribution?: string | null;
  adaptationNote?: string | null;
  capabilityStatus: RuleCapabilityStatus;
  /** 是否挂到当前可执行引擎；仅 SUPPORTED 才应为 true */
  executable: boolean;
};

export const RULE_CONTROL_RELATIONS = ["PRIMARY", "SUPPORTING"] as const;
export type RuleControlRelation = (typeof RULE_CONTROL_RELATIONS)[number];

export type RuleControlMapping = {
  id: string;
  ruleId: string;
  controlId: string;
  relation: RuleControlRelation;
  rationale: string | null;
  requiredContext: ContextRequirement[];
  priority: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Control ↔ Clause mapping (static knowledge; NOT case runtime)
// ---------------------------------------------------------------------------

export const CONTROL_CLAUSE_RELATIONS = [
  "CONTROL_SUPPORT",
  "POSSIBLE_OBLIGATION",
  "ESCALATION_TRIGGER",
] as const;
export type ControlClauseRelation = (typeof CONTROL_CLAUSE_RELATIONS)[number];

export const MAPPING_REVIEW_STATUSES = [
  "DRAFT",
  "REVIEWED",
  "APPROVED",
] as const;
export type MappingReviewStatus = (typeof MAPPING_REVIEW_STATUSES)[number];

export type ControlClauseMapping = {
  id: string;
  controlId: string;
  clauseId: string;
  relationType: ControlClauseRelation;
  rationale: string;
  requiredContext: ContextRequirement[];
  suggestedEvidence: EvidenceSuggestion[];
  suggestedChecklistItems: ChecklistSuggestion[];
  reviewStatus: MappingReviewStatus;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Case runtime (computed; not persisted in Step 1)
// ---------------------------------------------------------------------------

export const CASE_COMPLIANCE_RELEVANCES = [
  "DIRECT",
  "RELEVANT",
  "POSSIBLE",
  "INSUFFICIENT_CONTEXT",
] as const;
export type CaseComplianceRelevance =
  (typeof CASE_COMPLIANCE_RELEVANCES)[number];

export const VERSION_SELECTION_BASES = ["CASE_DATE", "CURRENT_DATE"] as const;
export type VersionSelectionBasis = (typeof VERSION_SELECTION_BASES)[number];

/**
 * Case 运行时合规关联（computed；不持久化表）。
 * INSUFFICIENT_CONTEXT 仅出现在本结构，不得回写静态 Mapping。
 */
export type CaseComplianceFinding = {
  /** 主规则（命中规则中 priority 最高者） */
  ruleId: string;
  /** 同一 control+clause 聚合的其他命中规则 */
  supportingRuleIds: string[];
  /** 关联 Evidence 溯源（来自命中 AnalysisResult） */
  evidenceIds: string[];
  controlId: string;
  controlCode: string;
  documentId: string;
  documentCanonicalCode: string;
  documentVersionId: string;
  versionKey: string;
  clauseId: string;
  clauseKey: string;
  relationType: ControlClauseRelation;
  relevance: CaseComplianceRelevance;
  rationale: string;
  missingContext: ContextRequirement[];
  suggestedEvidence: EvidenceSuggestion[];
  suggestedChecklist: ChecklistSuggestion[];
  versionSelectionBasis: VersionSelectionBasis;
  /** 用于选版的案件日历日；CURRENT_DATE 时可为 null */
  caseDate: string | null;
};

/**
 * Report 用法规引用快照（嵌入 ReportDraft JSON；Step 2B 不建表、不接报告 UI）。
 * 必须固定 caseDate / versionSelectionBasis / versionKey / clauseKey，避免导出时重选版本。
 */
export type ComplianceReferenceSnapshot = {
  documentId: string;
  documentVersionId: string;
  documentCanonicalCode: string;
  documentTitle: string;
  versionKey: string;
  versionLabel: string;
  clauseId: string;
  clauseKey: string;
  articleNumber: string | null;
  clauseHeading: string | null;
  relationType: ControlClauseRelation;
  rationaleSnapshot: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  caseDate: string | null;
  versionSelectionBasis: VersionSelectionBasis;
  controlId: string;
  controlCode: string;
  ruleId: string;
  supportingRuleIds: string[];
  evidenceIds: string[];
  relevance: CaseComplianceRelevance;
};

// ---------------------------------------------------------------------------
// Errors / parsing helpers
// ---------------------------------------------------------------------------

export class KnowledgeDomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "KnowledgeDomainError";
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new KnowledgeDomainError(
      "INVALID_ENUM",
      `${field} 无效：${String(value)}`,
    );
  }
  return value as T;
}

export function assertRightsContentMode(
  rightsStatus: RightsStatus,
  contentMode: ContentMode,
): void {
  if (rightsStatus === "UNKNOWN" && contentMode === "FULL_TEXT") {
    throw new KnowledgeDomainError(
      "RIGHTS_CONTENT_MODE",
      "rightsStatus=UNKNOWN 时不得使用 contentMode=FULL_TEXT",
    );
  }
}

/** calendar-day 比较用：取 UTC 日期 YYYY-MM-DD */
export function toCalendarDateKey(value: Date | string): string {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new KnowledgeDomainError("INVALID_DATE", `日期无效：${value}`);
    }
    return d.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function assertVersionDateWindow(
  effectiveDate: Date | string,
  expiryDate: Date | string | null | undefined,
): void {
  const effective = toCalendarDateKey(effectiveDate);
  if (expiryDate == null || expiryDate === "") return;
  const expiry = toCalendarDateKey(expiryDate);
  if (expiry <= effective) {
    throw new KnowledgeDomainError(
      "INVALID_DATE_WINDOW",
      "版本日期窗口须满足 effectiveDate < expiryDate（半开区间）",
    );
  }
}

export function assertClauseTextForContentMode(
  contentMode: ContentMode,
  originalText: string | null | undefined,
): void {
  const hasText =
    typeof originalText === "string" && originalText.trim().length > 0;
  if (contentMode === "METADATA_ONLY" && hasText) {
    throw new KnowledgeDomainError(
      "CLAUSE_TEXT_RIGHTS",
      "METADATA_ONLY 版本不得存放 originalText 全文",
    );
  }
  if (contentMode === "SUMMARY_ONLY" && hasText) {
    throw new KnowledgeDomainError(
      "CLAUSE_TEXT_RIGHTS",
      "SUMMARY_ONLY 版本不得依赖 originalText 作为正式正文",
    );
  }
}

function parseSuggestionList(
  value: unknown,
  field: string,
): Array<{ key: string; label: string; description?: string }> {
  if (!Array.isArray(value)) {
    throw new KnowledgeDomainError("INVALID_JSON", `${field} 必须为数组`);
  }
  return value.map((item, index) => {
    if (!isObject(item) || typeof item.key !== "string" || typeof item.label !== "string") {
      throw new KnowledgeDomainError(
        "INVALID_JSON",
        `${field}[${index}] 须含 key/label 字符串`,
      );
    }
    const description =
      item.description === undefined
        ? undefined
        : typeof item.description === "string"
          ? item.description
          : (() => {
              throw new KnowledgeDomainError(
                "INVALID_JSON",
                `${field}[${index}].description 无效`,
              );
            })();
    return { key: item.key, label: item.label, description };
  });
}

export function parseContextRequirements(value: unknown): ContextRequirement[] {
  return parseSuggestionList(value, "requiredContext");
}

export function parseEvidenceSuggestions(value: unknown): EvidenceSuggestion[] {
  return parseSuggestionList(value, "suggestedEvidence");
}

export function parseChecklistSuggestions(
  value: unknown,
): ChecklistSuggestion[] {
  return parseSuggestionList(value, "suggestedChecklistItems");
}

export function parseTopics(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new KnowledgeDomainError("INVALID_JSON", "topics 必须为字符串数组");
  }
  return value.map((t, i) => {
    if (typeof t !== "string" || !t.trim()) {
      throw new KnowledgeDomainError("INVALID_JSON", `topics[${i}] 无效`);
    }
    return t;
  });
}

/**
 * 仅判断 required key 是否出现在 available keys 中（无 value DSL）。
 */
export function resolveMissingContext(
  requirements: ContextRequirement[],
  availableContextKeys: readonly string[],
): ContextRequirement[] {
  const available = new Set(availableContextKeys);
  return requirements.filter((r) => !available.has(r.key));
}

export type VersionSelectCandidate = {
  id: string;
  publicationStatus: PublicationStatus;
  effectiveDate: string | Date;
  expiryDate: string | Date | null;
  legalStatus: LegalStatus;
};

/**
 * 在给定日历日选择适用版本。
 * - 仅 PUBLISHED
 * - 窗口：[effectiveDate, expiryDate)
 * - 不因当前 legalStatus=SUPERSEDED 排除历史版本
 * - 多匹配取 effectiveDate 最新
 */
export function selectApplicableVersionAt<T extends VersionSelectCandidate>(
  versions: readonly T[],
  relevantDate: string | Date,
): T | null {
  const day = toCalendarDateKey(relevantDate);
  const matched = versions
    .filter((v) => v.publicationStatus === "PUBLISHED")
    .filter((v) => {
      const effective = toCalendarDateKey(v.effectiveDate);
      if (effective > day) return false;
      if (v.expiryDate == null || v.expiryDate === "") return true;
      return day < toCalendarDateKey(v.expiryDate);
    })
    .sort(
      (a, b) =>
        toCalendarDateKey(b.effectiveDate).localeCompare(
          toCalendarDateKey(a.effectiveDate),
        ),
    );
  return matched[0] ?? null;
}

/**
 * 无案件日期时：取「当前」仍在窗口内的 PUBLISHED 版本（effective 最新）。
 * 调用方须记录 VersionSelectionBasis = CURRENT_DATE。
 */
export function selectCurrentApplicableVersion<T extends VersionSelectCandidate>(
  versions: readonly T[],
  now: string | Date = new Date(),
): T | null {
  return selectApplicableVersionAt(versions, now);
}

/**
 * 条款父子必须同属一个 DocumentVersion。
 * Prisma FK 无法阻止跨版本 parent；importer / repository 边界强制。
 */
export function assertClauseParentSameVersion(input: {
  clauseDocumentVersionId: string;
  parentClauseId: string | null | undefined;
  parentDocumentVersionId: string | null | undefined;
}): void {
  if (!input.parentClauseId) return;
  if (
    !input.parentDocumentVersionId ||
    input.parentDocumentVersionId !== input.clauseDocumentVersionId
  ) {
    throw new KnowledgeDomainError(
      "CLAUSE_PARENT_VERSION",
      "parentClause 必须属于同一 documentVersion",
    );
  }
}

/**
 * 校验 ruleId 是否存在于可执行 Security Rule Registry（字符串集合）。
 * 不重构规则引擎；供 Mapping importer 使用。
 */
export function assertKnownRuleId(
  ruleId: string,
  knownRuleIds: ReadonlySet<string> | readonly string[],
): void {
  const set =
    knownRuleIds instanceof Set
      ? knownRuleIds
      : new Set(knownRuleIds);
  if (!set.has(ruleId)) {
    throw new KnowledgeDomainError(
      "UNKNOWN_RULE_ID",
      `ruleId 不在当前 Security Rule Registry：${ruleId}`,
    );
  }
}

/**
 * 最小 relevance helper（非完整 Case engine）：
 * 缺 requiredContext → INSUFFICIENT_CONTEXT；否则默认 RELEVANT。
 */
export function resolveFindingRelevanceFromContext(
  requirements: ContextRequirement[],
  availableContextKeys: readonly string[],
): CaseComplianceRelevance {
  const missing = resolveMissingContext(requirements, availableContextKeys);
  return missing.length > 0 ? "INSUFFICIENT_CONTEXT" : "RELEVANT";
}
