/**
 * Curated Knowledge Pack 输入形状（Step 2A）。
 * 以 controlCode / clauseKey / versionKey 引用，importer 负责解析为 DB id。
 */
import type {
  ChecklistSuggestion,
  ContentMode,
  ContextRequirement,
  ControlClauseRelation,
  DocumentType,
  EvidenceSuggestion,
  KnowledgeSourceType,
  LegalStatus,
  MappingReviewStatus,
  PublicationStatus,
  RightsStatus,
  RuleControlRelation,
  ComplianceControlDomain,
  ComplianceControlStatus,
} from "@/domain/knowledge";

export type PackClauseInput = {
  clauseKey: string;
  articleNumber?: string | null;
  chapter?: string | null;
  section?: string | null;
  heading?: string | null;
  /** 同 version 内 parent clauseKey */
  parentClauseKey?: string | null;
  originalText?: string | null;
  summary?: string | null;
  interpretation?: string | null;
  topics: string[];
  sortOrder: number;
};

export type PackVersionInput = {
  versionKey: string;
  versionLabel: string;
  documentNumber?: string | null;
  publishDate?: string | null;
  effectiveDate: string;
  expiryDate?: string | null;
  publicationStatus: PublicationStatus;
  legalStatus: LegalStatus;
  sourceType: KnowledgeSourceType;
  sourceUrl?: string | null;
  rightsStatus: RightsStatus;
  contentMode: ContentMode;
  sourceFileName?: string | null;
  sourceFileHash?: string | null;
  reviewedAt?: string | null;
  publishedAt?: string | null;
  clauses: PackClauseInput[];
};

export type PackDocumentInput = {
  canonicalCode: string;
  title: string;
  documentType: DocumentType;
  jurisdiction: string;
  issuingAuthority: string;
  description?: string | null;
  version: PackVersionInput;
};

export type PackControlInput = {
  controlCode: string;
  title: string;
  domain: ComplianceControlDomain;
  description: string;
  objectives?: string | null;
  requiredContext?: ContextRequirement[];
  suggestedEvidence?: EvidenceSuggestion[];
  suggestedChecklistItems?: ChecklistSuggestion[];
  status: ComplianceControlStatus;
};

export type PackRuleControlMappingInput = {
  ruleId: string;
  controlCode: string;
  relation: RuleControlRelation;
  rationale?: string | null;
  requiredContext?: ContextRequirement[];
  priority?: number;
};

export type PackControlClauseMappingInput = {
  controlCode: string;
  documentCanonicalCode: string;
  versionKey: string;
  clauseKey: string;
  relationType: ControlClauseRelation;
  rationale: string;
  requiredContext?: ContextRequirement[];
  suggestedEvidence?: EvidenceSuggestion[];
  suggestedChecklistItems?: ChecklistSuggestion[];
  reviewStatus: MappingReviewStatus;
  reviewedAt?: string | null;
};

export type CuratedKnowledgePack = {
  packId: string;
  packVersion: string;
  reviewedAt: string;
  documents: PackDocumentInput[];
  controls: PackControlInput[];
  ruleControlMappings: PackRuleControlMappingInput[];
  controlClauseMappings: PackControlClauseMappingInput[];
};

export type KnowledgePackImportStats = {
  documents: number;
  versions: number;
  clauses: number;
  controls: number;
  ruleControlMappings: number;
  controlClauseMappings: number;
};
