/**
 * Curated Knowledge Pack 幂等导入（Step 2A）。
 * 使用现有 Knowledge Repository upsert；不改 schema；不建 SecurityRule 表。
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  upsertComplianceClause,
  upsertComplianceControl,
  upsertComplianceDocument,
  upsertComplianceDocumentVersion,
  upsertControlClauseMapping,
  upsertRuleControlMapping,
  type KnowledgeDbClient,
} from "@/services/knowledge/knowledgeRepository";
import { curatedKnowledgePack } from "./curatedPack";
import type {
  CuratedKnowledgePack,
  KnowledgePackImportStats,
} from "./types";
import { validateCuratedPack } from "./validateCuratedPack";

export type ImportCuratedPackOptions = {
  pack?: CuratedKnowledgePack;
  db?: KnowledgeDbClient;
};

async function importWithClient(
  pack: CuratedKnowledgePack,
  db: KnowledgeDbClient,
): Promise<KnowledgePackImportStats> {
  validateCuratedPack(pack);

  const controlIdByCode = new Map<string, string>();
  const versionIdByDocVersion = new Map<string, string>();
  const clauseIdByRef = new Map<string, string>();

  for (const docInput of pack.documents) {
    const doc = await upsertComplianceDocument(
      {
        canonicalCode: docInput.canonicalCode,
        title: docInput.title,
        documentType: docInput.documentType,
        jurisdiction: docInput.jurisdiction,
        issuingAuthority: docInput.issuingAuthority,
        description: docInput.description,
      },
      db,
    );

    const v = docInput.version;
    const version = await upsertComplianceDocumentVersion(
      {
        documentId: doc.id,
        versionKey: v.versionKey,
        versionLabel: v.versionLabel,
        documentNumber: v.documentNumber,
        publishDate: v.publishDate,
        effectiveDate: v.effectiveDate,
        expiryDate: v.expiryDate,
        publicationStatus: v.publicationStatus,
        legalStatus: v.legalStatus,
        sourceType: v.sourceType,
        sourceUrl: v.sourceUrl,
        rightsStatus: v.rightsStatus,
        contentMode: v.contentMode,
        sourceFileName: v.sourceFileName,
        sourceFileHash: v.sourceFileHash,
        reviewedAt: v.reviewedAt,
        publishedAt: v.publishedAt,
      },
      db,
    );
    versionIdByDocVersion.set(
      `${docInput.canonicalCode}::${v.versionKey}`,
      version.id,
    );

    // 两遍：先无 parent，再挂 parent（支持任意声明顺序）
    for (const pass of [1, 2] as const) {
      for (const clause of v.clauses) {
        const needsParent = Boolean(clause.parentClauseKey);
        if (pass === 1 && needsParent) continue;
        if (pass === 2 && !needsParent) continue;

        let parentClauseId: string | null = null;
        if (clause.parentClauseKey) {
          parentClauseId =
            clauseIdByRef.get(
              `${docInput.canonicalCode}::${v.versionKey}::${clause.parentClauseKey}`,
            ) ?? null;
          if (!parentClauseId) {
            throw new Error(
              `parent clause 未解析：${clause.parentClauseKey}`,
            );
          }
        }

        const saved = await upsertComplianceClause(
          {
            documentVersionId: version.id,
            clauseKey: clause.clauseKey,
            articleNumber: clause.articleNumber,
            chapter: clause.chapter,
            section: clause.section,
            heading: clause.heading,
            parentClauseId,
            originalText: clause.originalText,
            summary: clause.summary,
            interpretation: clause.interpretation,
            topics: clause.topics,
            sortOrder: clause.sortOrder,
            versionContentMode: v.contentMode,
          },
          db,
        );
        clauseIdByRef.set(
          `${docInput.canonicalCode}::${v.versionKey}::${clause.clauseKey}`,
          saved.id,
        );
      }
    }
  }

  for (const control of pack.controls) {
    const saved = await upsertComplianceControl(
      {
        controlCode: control.controlCode,
        title: control.title,
        domain: control.domain,
        description: control.description,
        objectives: control.objectives,
        requiredContext: control.requiredContext,
        suggestedEvidence: control.suggestedEvidence,
        suggestedChecklistItems: control.suggestedChecklistItems,
        status: control.status,
      },
      db,
    );
    controlIdByCode.set(control.controlCode, saved.id);
  }

  for (const m of pack.ruleControlMappings) {
    const controlId = controlIdByCode.get(m.controlCode);
    if (!controlId) throw new Error(`control 未解析：${m.controlCode}`);
    await upsertRuleControlMapping(
      {
        ruleId: m.ruleId,
        controlId,
        relation: m.relation,
        rationale: m.rationale,
        requiredContext: m.requiredContext,
        priority: m.priority,
      },
      db,
    );
  }

  for (const m of pack.controlClauseMappings) {
    const controlId = controlIdByCode.get(m.controlCode);
    const clauseId = clauseIdByRef.get(
      `${m.documentCanonicalCode}::${m.versionKey}::${m.clauseKey}`,
    );
    if (!controlId) throw new Error(`control 未解析：${m.controlCode}`);
    if (!clauseId) {
      throw new Error(
        `clause 未解析：${m.documentCanonicalCode}/${m.clauseKey}`,
      );
    }
    await upsertControlClauseMapping(
      {
        controlId,
        clauseId,
        relationType: m.relationType,
        rationale: m.rationale,
        requiredContext: m.requiredContext,
        suggestedEvidence: m.suggestedEvidence,
        suggestedChecklistItems: m.suggestedChecklistItems,
        reviewStatus: m.reviewStatus,
        reviewedAt: m.reviewedAt,
      },
      db,
    );
  }

  return {
    documents: pack.documents.length,
    versions: pack.documents.length,
    clauses: pack.documents.reduce((n, d) => n + d.version.clauses.length, 0),
    controls: pack.controls.length,
    ruleControlMappings: pack.ruleControlMappings.length,
    controlClauseMappings: pack.controlClauseMappings.length,
  };
}

/**
 * 幂等导入 curated pack。默认同事务执行。
 */
export async function importCuratedKnowledgePack(
  options: ImportCuratedPackOptions = {},
): Promise<KnowledgePackImportStats> {
  const pack = options.pack ?? curatedKnowledgePack;
  if (options.db) {
    return importWithClient(pack, options.db);
  }
  return prisma.$transaction(
    async (tx) => importWithClient(pack, tx as Prisma.TransactionClient),
    { timeout: 60_000 },
  );
}

/** 供 seed / smoke 打印 */
export async function countKnowledgeTables(
  db: KnowledgeDbClient = prisma,
): Promise<KnowledgePackImportStats> {
  const [
    documents,
    versions,
    clauses,
    controls,
    ruleControlMappings,
    controlClauseMappings,
  ] = await Promise.all([
    db.complianceDocument.count(),
    db.complianceDocumentVersion.count(),
    db.complianceClause.count(),
    db.complianceControl.count(),
    db.ruleControlMapping.count(),
    db.controlClauseMapping.count(),
  ]);
  return {
    documents,
    versions,
    clauses,
    controls,
    ruleControlMappings,
    controlClauseMappings,
  };
}
