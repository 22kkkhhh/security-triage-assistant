/**
 * Knowledge persistence（v1.4 Step 1）。
 * 最小 upsert/read API，服务 Step 2 curated pack importer；无 Admin CRUD / 无产品删除。
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertClauseParentSameVersion,
  assertClauseTextForContentMode,
  assertKnownRuleId,
  assertRightsContentMode,
  assertVersionDateWindow,
  CONTENT_MODES,
  CONTROL_CLAUSE_RELATIONS,
  COMPLIANCE_CONTROL_DOMAINS,
  COMPLIANCE_CONTROL_STATUSES,
  DOCUMENT_TYPES,
  KNOWLEDGE_SOURCE_TYPES,
  LEGAL_STATUSES,
  MAPPING_REVIEW_STATUSES,
  parseEnumValue,
  PUBLICATION_STATUSES,
  RIGHTS_STATUSES,
  RULE_CONTROL_RELATIONS,
  type ChecklistSuggestion,
  type ContentMode,
  type ContextRequirement,
  type ControlClauseRelation,
  type EvidenceSuggestion,
  type MappingReviewStatus,
  type PublicationStatus,
  type RightsStatus,
  type RuleControlRelation,
} from "@/domain/knowledge";
import { allRules } from "@/services/analysis/runRules";
import {
  mapComplianceClause,
  mapComplianceControl,
  mapComplianceDocument,
  mapComplianceDocumentVersion,
  mapControlClauseMapping,
  mapRuleControlMapping,
  toKnowledgeJsonValue,
} from "./knowledgeMapper";

export type KnowledgeDbClient = Prisma.TransactionClient | typeof prisma;

const executableRuleIds = (): ReadonlySet<string> =>
  new Set(allRules.map((r) => r.ruleId));

function parseCalendarDateInput(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无效日期：${value}`);
  }
  return d;
}

export type UpsertDocumentInput = {
  canonicalCode: string;
  title: string;
  documentType: string;
  jurisdiction: string;
  issuingAuthority: string;
  description?: string | null;
};

export type UpsertVersionInput = {
  documentId: string;
  versionKey: string;
  versionLabel: string;
  documentNumber?: string | null;
  publishDate?: string | Date | null;
  effectiveDate: string | Date;
  expiryDate?: string | Date | null;
  publicationStatus: string;
  legalStatus: string;
  sourceType: string;
  sourceUrl?: string | null;
  rightsStatus: string;
  contentMode: string;
  sourceFileName?: string | null;
  sourceFileHash?: string | null;
  reviewedAt?: string | Date | null;
  publishedAt?: string | Date | null;
};

export type UpsertClauseInput = {
  documentVersionId: string;
  clauseKey: string;
  articleNumber?: string | null;
  chapter?: string | null;
  section?: string | null;
  heading?: string | null;
  parentClauseId?: string | null;
  originalText?: string | null;
  summary?: string | null;
  interpretation?: string | null;
  topics?: string[];
  sortOrder: number;
  /** 版本 contentMode；用于正文权利校验 */
  versionContentMode: ContentMode;
};

export type UpsertControlInput = {
  controlCode: string;
  title: string;
  domain: string;
  description: string;
  objectives?: string | null;
  requiredContext?: ContextRequirement[];
  suggestedEvidence?: EvidenceSuggestion[];
  suggestedChecklistItems?: ChecklistSuggestion[];
  status: string;
};

export type UpsertRuleControlMappingInput = {
  ruleId: string;
  controlId: string;
  relation: string;
  rationale?: string | null;
  requiredContext?: ContextRequirement[];
  priority?: number;
  /** 默认校验可执行 registry；测试可注入 */
  knownRuleIds?: ReadonlySet<string> | readonly string[];
};

export type UpsertControlClauseMappingInput = {
  controlId: string;
  clauseId: string;
  relationType: string;
  rationale: string;
  requiredContext?: ContextRequirement[];
  suggestedEvidence?: EvidenceSuggestion[];
  suggestedChecklistItems?: ChecklistSuggestion[];
  reviewStatus: string;
  reviewedAt?: string | Date | null;
};

export async function upsertComplianceDocument(
  input: UpsertDocumentInput,
  db: KnowledgeDbClient = prisma,
) {
  parseEnumValue(input.documentType, DOCUMENT_TYPES, "documentType");
  const row = await db.complianceDocument.upsert({
    where: { canonicalCode: input.canonicalCode },
    create: {
      canonicalCode: input.canonicalCode,
      title: input.title,
      documentType: input.documentType,
      jurisdiction: input.jurisdiction,
      issuingAuthority: input.issuingAuthority,
      description: input.description ?? null,
    },
    update: {
      title: input.title,
      documentType: input.documentType,
      jurisdiction: input.jurisdiction,
      issuingAuthority: input.issuingAuthority,
      description: input.description ?? null,
    },
  });
  return mapComplianceDocument(row);
}

export async function upsertComplianceDocumentVersion(
  input: UpsertVersionInput,
  db: KnowledgeDbClient = prisma,
) {
  const publicationStatus = parseEnumValue(
    input.publicationStatus,
    PUBLICATION_STATUSES,
    "publicationStatus",
  ) as PublicationStatus;
  parseEnumValue(input.legalStatus, LEGAL_STATUSES, "legalStatus");
  parseEnumValue(input.sourceType, KNOWLEDGE_SOURCE_TYPES, "sourceType");
  const rightsStatus = parseEnumValue(
    input.rightsStatus,
    RIGHTS_STATUSES,
    "rightsStatus",
  ) as RightsStatus;
  const contentMode = parseEnumValue(
    input.contentMode,
    CONTENT_MODES,
    "contentMode",
  ) as ContentMode;
  assertRightsContentMode(rightsStatus, contentMode);
  assertVersionDateWindow(input.effectiveDate, input.expiryDate);

  const data = {
    versionLabel: input.versionLabel,
    documentNumber: input.documentNumber ?? null,
    publishDate:
      input.publishDate == null ? null : parseCalendarDateInput(input.publishDate),
    effectiveDate: parseCalendarDateInput(input.effectiveDate),
    expiryDate:
      input.expiryDate == null ? null : parseCalendarDateInput(input.expiryDate),
    publicationStatus,
    legalStatus: input.legalStatus,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    rightsStatus,
    contentMode,
    sourceFileName: input.sourceFileName ?? null,
    sourceFileHash: input.sourceFileHash ?? null,
    reviewedAt:
      input.reviewedAt == null ? null : parseCalendarDateInput(input.reviewedAt),
    publishedAt:
      input.publishedAt == null
        ? null
        : parseCalendarDateInput(input.publishedAt),
  };

  const row = await db.complianceDocumentVersion.upsert({
    where: {
      documentId_versionKey: {
        documentId: input.documentId,
        versionKey: input.versionKey,
      },
    },
    create: {
      documentId: input.documentId,
      versionKey: input.versionKey,
      ...data,
    },
    update: data,
  });
  return mapComplianceDocumentVersion(row);
}

export async function upsertComplianceClause(
  input: UpsertClauseInput,
  db: KnowledgeDbClient = prisma,
) {
  assertClauseTextForContentMode(
    input.versionContentMode,
    input.originalText,
  );

  if (input.parentClauseId) {
    const parent = await db.complianceClause.findUnique({
      where: { id: input.parentClauseId },
    });
    assertClauseParentSameVersion({
      clauseDocumentVersionId: input.documentVersionId,
      parentClauseId: input.parentClauseId,
      parentDocumentVersionId: parent?.documentVersionId ?? null,
    });
  }

  const data = {
    articleNumber: input.articleNumber ?? null,
    chapter: input.chapter ?? null,
    section: input.section ?? null,
    heading: input.heading ?? null,
    parentClauseId: input.parentClauseId ?? null,
    originalText: input.originalText ?? null,
    summary: input.summary ?? null,
    interpretation: input.interpretation ?? null,
    topics: toKnowledgeJsonValue(input.topics ?? []),
    sortOrder: input.sortOrder,
  };

  const row = await db.complianceClause.upsert({
    where: {
      documentVersionId_clauseKey: {
        documentVersionId: input.documentVersionId,
        clauseKey: input.clauseKey,
      },
    },
    create: {
      documentVersionId: input.documentVersionId,
      clauseKey: input.clauseKey,
      ...data,
    },
    update: data,
  });
  return mapComplianceClause(row);
}

export async function upsertComplianceControl(
  input: UpsertControlInput,
  db: KnowledgeDbClient = prisma,
) {
  parseEnumValue(input.domain, COMPLIANCE_CONTROL_DOMAINS, "domain");
  parseEnumValue(input.status, COMPLIANCE_CONTROL_STATUSES, "status");
  const data = {
    title: input.title,
    domain: input.domain,
    description: input.description,
    objectives: input.objectives ?? null,
    requiredContext: toKnowledgeJsonValue(input.requiredContext ?? []),
    suggestedEvidence: toKnowledgeJsonValue(input.suggestedEvidence ?? []),
    suggestedChecklistItems: toKnowledgeJsonValue(
      input.suggestedChecklistItems ?? [],
    ),
    status: input.status,
  };
  const row = await db.complianceControl.upsert({
    where: { controlCode: input.controlCode },
    create: {
      controlCode: input.controlCode,
      ...data,
    },
    update: data,
  });
  return mapComplianceControl(row);
}

export async function upsertRuleControlMapping(
  input: UpsertRuleControlMappingInput,
  db: KnowledgeDbClient = prisma,
) {
  assertKnownRuleId(input.ruleId, input.knownRuleIds ?? executableRuleIds());
  parseEnumValue(input.relation, RULE_CONTROL_RELATIONS, "relation") as RuleControlRelation;
  const data = {
    relation: input.relation,
    rationale: input.rationale ?? null,
    requiredContext: toKnowledgeJsonValue(input.requiredContext ?? []),
    priority: input.priority ?? 0,
  };
  const row = await db.ruleControlMapping.upsert({
    where: {
      ruleId_controlId: {
        ruleId: input.ruleId,
        controlId: input.controlId,
      },
    },
    create: {
      ruleId: input.ruleId,
      controlId: input.controlId,
      ...data,
    },
    update: data,
  });
  return mapRuleControlMapping(row);
}

export async function upsertControlClauseMapping(
  input: UpsertControlClauseMappingInput,
  db: KnowledgeDbClient = prisma,
) {
  parseEnumValue(
    input.relationType,
    CONTROL_CLAUSE_RELATIONS,
    "relationType",
  ) as ControlClauseRelation;
  parseEnumValue(
    input.reviewStatus,
    MAPPING_REVIEW_STATUSES,
    "reviewStatus",
  ) as MappingReviewStatus;
  const data = {
    rationale: input.rationale,
    requiredContext: toKnowledgeJsonValue(input.requiredContext ?? []),
    suggestedEvidence: toKnowledgeJsonValue(input.suggestedEvidence ?? []),
    suggestedChecklistItems: toKnowledgeJsonValue(
      input.suggestedChecklistItems ?? [],
    ),
    reviewStatus: input.reviewStatus,
    reviewedAt:
      input.reviewedAt == null
        ? null
        : parseCalendarDateInput(input.reviewedAt),
  };
  const row = await db.controlClauseMapping.upsert({
    where: {
      controlId_clauseId_relationType: {
        controlId: input.controlId,
        clauseId: input.clauseId,
        relationType: input.relationType,
      },
    },
    create: {
      controlId: input.controlId,
      clauseId: input.clauseId,
      relationType: input.relationType,
      ...data,
    },
    update: data,
  });
  return mapControlClauseMapping(row);
}

export async function getComplianceDocumentByCanonicalCode(
  canonicalCode: string,
  db: KnowledgeDbClient = prisma,
) {
  const row = await db.complianceDocument.findUnique({
    where: { canonicalCode },
  });
  return row ? mapComplianceDocument(row) : null;
}

export async function listDocumentVersions(
  documentId: string,
  db: KnowledgeDbClient = prisma,
) {
  const rows = await db.complianceDocumentVersion.findMany({
    where: { documentId },
    orderBy: { effectiveDate: "asc" },
  });
  return rows.map(mapComplianceDocumentVersion);
}

export async function listClausesForVersion(
  documentVersionId: string,
  db: KnowledgeDbClient = prisma,
) {
  const rows = await db.complianceClause.findMany({
    where: { documentVersionId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(mapComplianceClause);
}

export async function getComplianceControlByCode(
  controlCode: string,
  db: KnowledgeDbClient = prisma,
) {
  const row = await db.complianceControl.findUnique({ where: { controlCode } });
  return row ? mapComplianceControl(row) : null;
}

export async function listRuleControlMappingsByRule(
  ruleId: string,
  db: KnowledgeDbClient = prisma,
) {
  const rows = await db.ruleControlMapping.findMany({ where: { ruleId } });
  return rows.map(mapRuleControlMapping);
}

export async function listControlClauseMappingsByControl(
  controlId: string,
  db: KnowledgeDbClient = prisma,
) {
  const rows = await db.controlClauseMapping.findMany({ where: { controlId } });
  return rows.map(mapControlClauseMapping);
}
