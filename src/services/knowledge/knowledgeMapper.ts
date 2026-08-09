/**
 * Knowledge Prisma Row → Domain（严格校验枚举 / JSON / 日期窗口）。
 */
import type { Prisma } from "@/generated/prisma/client";
import {
  assertRightsContentMode,
  assertVersionDateWindow,
  COMPLIANCE_CONTROL_DOMAINS,
  COMPLIANCE_CONTROL_STATUSES,
  CONTENT_MODES,
  CONTROL_CLAUSE_RELATIONS,
  DOCUMENT_TYPES,
  KnowledgeDomainError,
  KNOWLEDGE_SOURCE_TYPES,
  LEGAL_STATUSES,
  MAPPING_REVIEW_STATUSES,
  parseChecklistSuggestions,
  parseContextRequirements,
  parseEnumValue,
  parseEvidenceSuggestions,
  parseTopics,
  PUBLICATION_STATUSES,
  RIGHTS_STATUSES,
  RULE_CONTROL_RELATIONS,
  type ComplianceClause,
  type ComplianceControl,
  type ComplianceDocument,
  type ComplianceDocumentVersion,
  type ControlClauseMapping,
  type RuleControlMapping,
} from "@/domain/knowledge";
import { decodeKnowledgeJson } from "./knowledgeJson";

export type ComplianceDocumentRow = {
  id: string;
  canonicalCode: string;
  title: string;
  documentType: string;
  jurisdiction: string;
  issuingAuthority: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplianceDocumentVersionRow = {
  id: string;
  documentId: string;
  versionKey: string;
  versionLabel: string;
  documentNumber: string | null;
  publishDate: Date | null;
  effectiveDate: Date;
  expiryDate: Date | null;
  publicationStatus: string;
  legalStatus: string;
  sourceType: string;
  sourceUrl: string | null;
  rightsStatus: string;
  contentMode: string;
  sourceFileName: string | null;
  sourceFileHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  publishedAt: Date | null;
};

export type ComplianceClauseRow = {
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
  topics: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplianceControlRow = {
  id: string;
  controlCode: string;
  title: string;
  domain: string;
  description: string;
  objectives: string | null;
  requiredContext: unknown;
  suggestedEvidence: unknown;
  suggestedChecklistItems: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RuleControlMappingRow = {
  id: string;
  ruleId: string;
  controlId: string;
  relation: string;
  rationale: string | null;
  requiredContext: unknown;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ControlClauseMappingRow = {
  id: string;
  controlId: string;
  clauseId: string;
  relationType: string;
  rationale: string;
  requiredContext: unknown;
  suggestedEvidence: unknown;
  suggestedChecklistItems: unknown;
  reviewStatus: string;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function dateToIso(value: Date): string {
  return value.toISOString();
}

function dateToIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Domain / 输入结构 → Prisma Json */
export function toKnowledgeJsonValue(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function mapComplianceDocument(
  row: ComplianceDocumentRow,
): ComplianceDocument {
  return {
    id: row.id,
    canonicalCode: row.canonicalCode,
    title: row.title,
    documentType: parseEnumValue(row.documentType, DOCUMENT_TYPES, "documentType"),
    jurisdiction: row.jurisdiction,
    issuingAuthority: row.issuingAuthority,
    description: row.description,
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
  };
}

export function mapComplianceDocumentVersion(
  row: ComplianceDocumentVersionRow,
): ComplianceDocumentVersion {
  const publicationStatus = parseEnumValue(
    row.publicationStatus,
    PUBLICATION_STATUSES,
    "publicationStatus",
  );
  const legalStatus = parseEnumValue(
    row.legalStatus,
    LEGAL_STATUSES,
    "legalStatus",
  );
  const sourceType = parseEnumValue(
    row.sourceType,
    KNOWLEDGE_SOURCE_TYPES,
    "sourceType",
  );
  const rightsStatus = parseEnumValue(
    row.rightsStatus,
    RIGHTS_STATUSES,
    "rightsStatus",
  );
  const contentMode = parseEnumValue(
    row.contentMode,
    CONTENT_MODES,
    "contentMode",
  );
  assertRightsContentMode(rightsStatus, contentMode);
  assertVersionDateWindow(row.effectiveDate, row.expiryDate);

  return {
    id: row.id,
    documentId: row.documentId,
    versionKey: row.versionKey,
    versionLabel: row.versionLabel,
    documentNumber: row.documentNumber,
    publishDate: dateToIsoOrNull(row.publishDate),
    effectiveDate: dateToIso(row.effectiveDate),
    expiryDate: dateToIsoOrNull(row.expiryDate),
    publicationStatus,
    legalStatus,
    sourceType,
    sourceUrl: row.sourceUrl,
    rightsStatus,
    contentMode,
    sourceFileName: row.sourceFileName,
    sourceFileHash: row.sourceFileHash,
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
    reviewedAt: dateToIsoOrNull(row.reviewedAt),
    publishedAt: dateToIsoOrNull(row.publishedAt),
  };
}

export function mapComplianceClause(row: ComplianceClauseRow): ComplianceClause {
  if (typeof row.sortOrder !== "number" || !Number.isFinite(row.sortOrder)) {
    throw new KnowledgeDomainError("INVALID_FIELD", "sortOrder 无效");
  }
  return {
    id: row.id,
    documentVersionId: row.documentVersionId,
    clauseKey: row.clauseKey,
    articleNumber: row.articleNumber,
    chapter: row.chapter,
    section: row.section,
    heading: row.heading,
    parentClauseId: row.parentClauseId,
    originalText: row.originalText,
    summary: row.summary,
    interpretation: row.interpretation,
    topics: parseTopics(decodeKnowledgeJson(row.topics)),
    sortOrder: row.sortOrder,
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
  };
}

export function mapComplianceControl(
  row: ComplianceControlRow,
): ComplianceControl {
  return {
    id: row.id,
    controlCode: row.controlCode,
    title: row.title,
    domain: parseEnumValue(row.domain, COMPLIANCE_CONTROL_DOMAINS, "domain"),
    description: row.description,
    objectives: row.objectives,
    requiredContext: parseContextRequirements(
      decodeKnowledgeJson(row.requiredContext),
    ),
    suggestedEvidence: parseEvidenceSuggestions(
      decodeKnowledgeJson(row.suggestedEvidence),
    ),
    suggestedChecklistItems: parseChecklistSuggestions(
      decodeKnowledgeJson(row.suggestedChecklistItems),
    ),
    status: parseEnumValue(row.status, COMPLIANCE_CONTROL_STATUSES, "status"),
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
  };
}

export function mapRuleControlMapping(
  row: RuleControlMappingRow,
): RuleControlMapping {
  return {
    id: row.id,
    ruleId: row.ruleId,
    controlId: row.controlId,
    relation: parseEnumValue(row.relation, RULE_CONTROL_RELATIONS, "relation"),
    rationale: row.rationale,
    requiredContext: parseContextRequirements(
      decodeKnowledgeJson(row.requiredContext),
    ),
    priority: row.priority,
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
  };
}

export function mapControlClauseMapping(
  row: ControlClauseMappingRow,
): ControlClauseMapping {
  return {
    id: row.id,
    controlId: row.controlId,
    clauseId: row.clauseId,
    relationType: parseEnumValue(
      row.relationType,
      CONTROL_CLAUSE_RELATIONS,
      "relationType",
    ),
    rationale: row.rationale,
    requiredContext: parseContextRequirements(
      decodeKnowledgeJson(row.requiredContext),
    ),
    suggestedEvidence: parseEvidenceSuggestions(
      decodeKnowledgeJson(row.suggestedEvidence),
    ),
    suggestedChecklistItems: parseChecklistSuggestions(
      decodeKnowledgeJson(row.suggestedChecklistItems),
    ),
    reviewStatus: parseEnumValue(
      row.reviewStatus,
      MAPPING_REVIEW_STATUSES,
      "reviewStatus",
    ),
    reviewedAt: dateToIsoOrNull(row.reviewedAt),
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
  };
}
