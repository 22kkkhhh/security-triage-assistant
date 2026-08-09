/**
 * 将 Curated Pack 转为内存 KnowledgeResolutionGraph（无 DB）。
 * 供样例生成 / 离线 Snapshot 解析；ID 由 canonical/control/clause 键稳定派生。
 */
import type {
  ComplianceClause,
  ComplianceControl,
  ComplianceDocument,
  ComplianceDocumentVersion,
  ControlClauseMapping,
  RuleControlMapping,
} from "@/domain/knowledge";
import type { KnowledgeResolutionGraph } from "@/services/knowledge/resolveCaseCompliance";
import type { CuratedKnowledgePack } from "./types";
import { curatedKnowledgePack } from "./curatedPack";

function iso(day: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return `${day}T00:00:00.000Z`;
  return day;
}

export function curatedPackToResolutionGraph(
  pack: CuratedKnowledgePack = curatedKnowledgePack,
): KnowledgeResolutionGraph {
  const documentsById = new Map<string, ComplianceDocument>();
  const versionsById = new Map<string, ComplianceDocumentVersion>();
  const versionsByDocumentId = new Map<string, ComplianceDocumentVersion[]>();
  const clausesById = new Map<string, ComplianceClause>();
  const clausesByVersionKey = new Map<string, Map<string, ComplianceClause>>();
  const controlsById = new Map<string, ComplianceControl>();
  const controlIdByCode = new Map<string, string>();
  const clauseIdByRef = new Map<string, string>();

  const now = pack.reviewedAt;

  for (const docInput of pack.documents) {
    const documentId = `doc:${docInput.canonicalCode}`;
    const document: ComplianceDocument = {
      id: documentId,
      canonicalCode: docInput.canonicalCode,
      title: docInput.title,
      documentType: docInput.documentType,
      jurisdiction: docInput.jurisdiction,
      issuingAuthority: docInput.issuingAuthority,
      description: docInput.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    documentsById.set(documentId, document);

    const v = docInput.version;
    const versionId = `ver:${docInput.canonicalCode}:${v.versionKey}`;
    const version: ComplianceDocumentVersion = {
      id: versionId,
      documentId,
      versionKey: v.versionKey,
      versionLabel: v.versionLabel,
      documentNumber: v.documentNumber ?? null,
      publishDate: v.publishDate ? iso(v.publishDate) : null,
      effectiveDate: iso(v.effectiveDate),
      expiryDate: v.expiryDate ? iso(v.expiryDate) : null,
      publicationStatus: v.publicationStatus,
      legalStatus: v.legalStatus,
      sourceType: v.sourceType,
      sourceUrl: v.sourceUrl ?? null,
      rightsStatus: v.rightsStatus,
      contentMode: v.contentMode,
      sourceFileName: v.sourceFileName ?? null,
      sourceFileHash: v.sourceFileHash ?? null,
      createdAt: now,
      updatedAt: now,
      reviewedAt: v.reviewedAt ?? null,
      publishedAt: v.publishedAt ?? null,
    };
    versionsById.set(versionId, version);
    versionsByDocumentId.set(documentId, [version]);

    const byKey = new Map<string, ComplianceClause>();
    for (const c of v.clauses) {
      const clauseId = `clause:${docInput.canonicalCode}:${v.versionKey}:${c.clauseKey}`;
      const parentId = c.parentClauseKey
        ? `clause:${docInput.canonicalCode}:${v.versionKey}:${c.parentClauseKey}`
        : null;
      const clause: ComplianceClause = {
        id: clauseId,
        documentVersionId: versionId,
        clauseKey: c.clauseKey,
        articleNumber: c.articleNumber ?? null,
        chapter: c.chapter ?? null,
        section: c.section ?? null,
        heading: c.heading ?? null,
        parentClauseId: parentId,
        originalText: c.originalText ?? null,
        summary: c.summary ?? null,
        interpretation: c.interpretation ?? null,
        topics: c.topics,
        sortOrder: c.sortOrder,
        createdAt: now,
        updatedAt: now,
      };
      clausesById.set(clauseId, clause);
      byKey.set(c.clauseKey, clause);
      clauseIdByRef.set(
        `${docInput.canonicalCode}::${v.versionKey}::${c.clauseKey}`,
        clauseId,
      );
    }
    clausesByVersionKey.set(versionId, byKey);
  }

  for (const ctrl of pack.controls) {
    const id = `ctrl:${ctrl.controlCode}`;
    const control: ComplianceControl = {
      id,
      controlCode: ctrl.controlCode,
      title: ctrl.title,
      domain: ctrl.domain,
      description: ctrl.description,
      objectives: ctrl.objectives ?? null,
      requiredContext: ctrl.requiredContext ?? [],
      suggestedEvidence: ctrl.suggestedEvidence ?? [],
      suggestedChecklistItems: ctrl.suggestedChecklistItems ?? [],
      status: ctrl.status,
      createdAt: now,
      updatedAt: now,
    };
    controlsById.set(id, control);
    controlIdByCode.set(ctrl.controlCode, id);
  }

  const ruleControlByRuleId = new Map<string, RuleControlMapping[]>();
  pack.ruleControlMappings.forEach((m, index) => {
    const controlId = controlIdByCode.get(m.controlCode);
    if (!controlId) return;
    const mapping: RuleControlMapping = {
      id: `rc:${index}:${m.ruleId}:${m.controlCode}`,
      ruleId: m.ruleId,
      controlId,
      relation: m.relation,
      rationale: m.rationale ?? null,
      requiredContext: m.requiredContext ?? [],
      priority: m.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    const list = ruleControlByRuleId.get(m.ruleId) ?? [];
    list.push(mapping);
    ruleControlByRuleId.set(m.ruleId, list);
  });

  const controlClauseByControlId = new Map<string, ControlClauseMapping[]>();
  pack.controlClauseMappings.forEach((m, index) => {
    const controlId = controlIdByCode.get(m.controlCode);
    const clauseId = clauseIdByRef.get(
      `${m.documentCanonicalCode}::${m.versionKey}::${m.clauseKey}`,
    );
    if (!controlId || !clauseId) return;
    const mapping: ControlClauseMapping = {
      id: `cc:${index}:${m.controlCode}:${m.clauseKey}:${m.relationType}`,
      controlId,
      clauseId,
      relationType: m.relationType,
      rationale: m.rationale,
      requiredContext: m.requiredContext ?? [],
      suggestedEvidence: m.suggestedEvidence ?? [],
      suggestedChecklistItems: m.suggestedChecklistItems ?? [],
      reviewStatus: m.reviewStatus,
      reviewedAt: m.reviewedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const list = controlClauseByControlId.get(controlId) ?? [];
    list.push(mapping);
    controlClauseByControlId.set(controlId, list);
  });

  return {
    documentsById,
    versionsById,
    versionsByDocumentId,
    clausesById,
    clausesByVersionKey,
    controlsById,
    ruleControlByRuleId,
    controlClauseByControlId,
  };
}
