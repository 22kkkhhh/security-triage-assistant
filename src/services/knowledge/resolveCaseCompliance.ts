/**
 * v1.4 Step 2B：Runtime Compliance Resolution。
 *
 * 仅从 Case 实际命中的 executable ruleId 出发：
 * Rule → RuleControlMapping → Control → ControlClauseMapping → applicable Version/Clause
 *
 * 版本选择复用 selectApplicableVersionAt / selectCurrentApplicableVersion。
 * 不得通过静态 mapping 反推新的安全事件；不写回静态 Mapping。
 */
import {
  selectApplicableVersionAt,
  selectCurrentApplicableVersion,
  resolveMissingContext,
  toCalendarDateKey,
  type CaseComplianceFinding,
  type CaseComplianceRelevance,
  type ChecklistSuggestion,
  type ComplianceClause,
  type ComplianceControl,
  type ComplianceDocument,
  type ComplianceDocumentVersion,
  type ComplianceReferenceSnapshot,
  type ContextRequirement,
  type ControlClauseMapping,
  type ControlClauseRelation,
  type EvidenceSuggestion,
  type RuleControlMapping,
  type VersionSelectionBasis,
} from "@/domain/knowledge";
import type {
  AnalysisResult,
  Evidence,
  ObservationStatus,
  SecurityCase,
  SecurityCaseDraft,
} from "@/domain/types";
import { allRules } from "@/services/analysis/runRules";
import { prisma } from "@/lib/prisma";
import type { KnowledgeDbClient } from "@/services/knowledge/knowledgeRepository";
import {
  mapComplianceClause,
  mapComplianceControl,
  mapComplianceDocument,
  mapComplianceDocumentVersion,
  mapControlClauseMapping,
  mapRuleControlMapping,
} from "@/services/knowledge/knowledgeMapper";

const HIT_STATUSES: ReadonlySet<ObservationStatus> = new Set([
  "ABNORMAL",
  "UNKNOWN",
]);

const RELEVANCE_RANK: Record<CaseComplianceRelevance, number> = {
  DIRECT: 0,
  RELEVANT: 1,
  POSSIBLE: 2,
  INSUFFICIENT_CONTEXT: 3,
};

export type KnowledgeResolutionGraph = {
  documentsById: Map<string, ComplianceDocument>;
  versionsById: Map<string, ComplianceDocumentVersion>;
  versionsByDocumentId: Map<string, ComplianceDocumentVersion[]>;
  clausesById: Map<string, ComplianceClause>;
  /** documentVersionId → clauseKey → clause */
  clausesByVersionKey: Map<string, Map<string, ComplianceClause>>;
  controlsById: Map<string, ComplianceControl>;
  ruleControlByRuleId: Map<string, RuleControlMapping[]>;
  controlClauseByControlId: Map<string, ControlClauseMapping[]>;
};

export type ResolveCaseComplianceInput = {
  draft: SecurityCaseDraft | SecurityCase;
  analysisResults: AnalysisResult[];
  evidences?: Evidence[];
  /** 覆盖「当前日期」选版；测试可注入 */
  now?: Date | string;
  /** 默认 12；Case UI 后续可再截断 */
  topN?: number;
  /** 快照 capturedAt；默认 now ISO */
  capturedAt?: string;
  knownRuleIds?: ReadonlySet<string>;
};

export type ResolveCaseComplianceResult = {
  findings: CaseComplianceFinding[];
  snapshots: ComplianceReferenceSnapshot[];
  caseDate: string | null;
  versionSelectionBasis: VersionSelectionBasis;
  hitRuleIds: string[];
  skippedUnknownRuleIds: string[];
};

export function collectHitRuleIds(
  analysisResults: readonly AnalysisResult[],
  knownRuleIds: ReadonlySet<string>,
): { hitRuleIds: string[]; skippedUnknownRuleIds: string[] } {
  const hitRuleIds: string[] = [];
  const skippedUnknownRuleIds: string[] = [];
  const seen = new Set<string>();

  for (const result of analysisResults) {
    if (!HIT_STATUSES.has(result.status)) continue;
    if (!knownRuleIds.has(result.ruleId)) {
      if (!skippedUnknownRuleIds.includes(result.ruleId)) {
        skippedUnknownRuleIds.push(result.ruleId);
      }
      continue;
    }
    if (seen.has(result.ruleId)) continue;
    seen.add(result.ruleId);
    hitRuleIds.push(result.ruleId);
  }
  return { hitRuleIds, skippedUnknownRuleIds };
}

/**
 * 从 Case 上下文收集「已提供」的 context keys（存在性，无 value DSL）。
 */
export function collectAvailableContextKeys(
  draft: SecurityCaseDraft | SecurityCase,
): string[] {
  const keys: string[] = [];
  const { dataContext: d, networkContext: n, identityContext: i, businessContext: b, alert } =
    draft;

  if (alert.occurredAt) keys.push("occurredAt");
  if (d.accessedRecordCount != null) keys.push("accessedRecordCount");
  if (d.sensitiveFieldTypes.length > 0) keys.push("dataCategory");
  if (d.databaseName) keys.push("databaseName");
  if (d.tableName) keys.push("tableName");
  if (i.loginSourceIp) keys.push("loginSourceIp");
  if (i.accountName) keys.push("accountName");
  if (i.accessedSystems.length > 0) keys.push("accessedSystems");
  if (i.failedLoginAttempts != null) keys.push("failedLoginAttempts");
  if (n.outboundTransferBytes != null) keys.push("outboundVolume");
  if (n.externalDestination) {
    keys.push("externalDestination");
    // pack 使用 destinationRegion 表示去向/目的地线索
    keys.push("destinationRegion");
  }
  if (n.internalSourceIp) keys.push("internalSourceIp");
  if (b.changeTicketId) keys.push("changeTicketId");
  if (b.businessOwner) keys.push("businessOwner");
  if (
    b.ownerVerification === "CONFIRMED" ||
    b.ownerVerification === "NOT_CONFIRMED"
  ) {
    keys.push("businessOwnerConfirmed");
  }
  if (b.businessJustification) keys.push("businessJustification");
  if (
    b.plannedTaskStatus === "CONFIRMED" ||
    b.plannedTaskStatus === "NOT_FOUND"
  ) {
    keys.push("plannedTaskStatus");
  }
  return keys;
}

/**
 * 案件相关日历日：优先取 ISO 字面日期部分（保留告警本地日历日语义），
 * 避免 `+08:00` 凌晨被 UTC 切到前一日。
 */
export function toCaseCalendarDateKey(value: string | Date): string {
  if (typeof value === "string") {
    const literal = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (literal) return literal[1]!;
  }
  return toCalendarDateKey(value);
}

export function resolveCaseRelevantDate(
  draft: SecurityCaseDraft | SecurityCase,
): { caseDate: string | null; versionSelectionBasis: VersionSelectionBasis } {
  if (draft.alert.occurredAt) {
    return {
      caseDate: toCaseCalendarDateKey(draft.alert.occurredAt),
      versionSelectionBasis: "CASE_DATE",
    };
  }
  return {
    caseDate: null,
    versionSelectionBasis: "CURRENT_DATE",
  };
}

/**
 * 保守 relevance：
 * - 缺 ContextRequirement → INSUFFICIENT_CONTEXT
 * - POSSIBLE_OBLIGATION → POSSIBLE
 * - CONTROL_SUPPORT / ESCALATION_TRIGGER → 最多 RELEVANT
 * - 第一版：Rule 命中 + evidence 不得自动升为 DIRECT
 */
export function resolveFindingRelevance(input: {
  relationType: ControlClauseRelation;
  missingContext: ContextRequirement[];
  evidenceIds: readonly string[];
}): CaseComplianceRelevance {
  if (input.missingContext.length > 0) return "INSUFFICIENT_CONTEXT";
  if (input.relationType === "POSSIBLE_OBLIGATION") return "POSSIBLE";
  // CONTROL_SUPPORT / ESCALATION_TRIGGER
  // evidenceIds 保留溯源，但不因此升 DIRECT
  void input.evidenceIds;
  return "RELEVANT";
}

function mergeSuggestions<T extends { key: string }>(lists: T[][]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      if (!map.has(item.key)) map.set(item.key, item);
    }
  }
  return [...map.values()];
}

type AggregateBucket = {
  control: ComplianceControl;
  document: ComplianceDocument;
  version: ComplianceDocumentVersion;
  clause: ComplianceClause;
  relationType: ControlClauseRelation;
  mappingRationales: string[];
  mappingRequired: ContextRequirement[];
  mappingEvidence: EvidenceSuggestion[];
  mappingChecklist: ChecklistSuggestion[];
  ruleContributions: Array<{ ruleId: string; priority: number; evidenceIds: string[] }>;
  versionSelectionBasis: VersionSelectionBasis;
  caseDate: string | null;
};

function pickPrimaryRule(
  contributions: AggregateBucket["ruleContributions"],
): { ruleId: string; supportingRuleIds: string[]; evidenceIds: string[] } {
  const sorted = [...contributions].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.ruleId.localeCompare(b.ruleId);
  });
  const primary = sorted[0]!;
  const supportingRuleIds = sorted
    .map((c) => c.ruleId)
    .filter((id) => id !== primary.ruleId);
  const evidenceIds = [
    ...new Set(sorted.flatMap((c) => c.evidenceIds)),
  ].sort();
  return { ruleId: primary.ruleId, supportingRuleIds, evidenceIds };
}

/**
 * 纯函数：基于预加载 Knowledge graph 解析 findings / snapshots。
 */
export function resolveCaseComplianceFromGraph(
  input: ResolveCaseComplianceInput,
  graph: KnowledgeResolutionGraph,
): ResolveCaseComplianceResult {
  const knownRuleIds =
    input.knownRuleIds ?? new Set(allRules.map((r) => r.ruleId));
  const { hitRuleIds, skippedUnknownRuleIds } = collectHitRuleIds(
    input.analysisResults,
    knownRuleIds,
  );
  const now = input.now ?? new Date();
  const { caseDate, versionSelectionBasis } = resolveCaseRelevantDate(
    input.draft,
  );
  const availableKeys = collectAvailableContextKeys(input.draft);
  const evidenceByRule = new Map<string, string[]>();
  for (const result of input.analysisResults) {
    evidenceByRule.set(result.ruleId, [...result.evidenceIds]);
  }
  // 可选：用 evidences 数组补全（若 analysis 未带 evidenceIds）
  if (input.evidences) {
    for (const ev of input.evidences) {
      const list = evidenceByRule.get(ev.relatedRuleId) ?? [];
      if (!list.includes(ev.evidenceId)) list.push(ev.evidenceId);
      evidenceByRule.set(ev.relatedRuleId, list);
    }
  }

  const buckets = new Map<string, AggregateBucket>();

  for (const ruleId of hitRuleIds) {
    const ruleMaps = graph.ruleControlByRuleId.get(ruleId) ?? [];
    for (const rc of ruleMaps) {
      const control = graph.controlsById.get(rc.controlId);
      if (!control || control.status === "RETIRED") continue;

      const clauseMaps = graph.controlClauseByControlId.get(control.id) ?? [];
      for (const ccm of clauseMaps) {
        // 正式解析仅使用 APPROVED（与 curated pack 一致）
        if (ccm.reviewStatus !== "APPROVED") continue;

        const mappedClause = graph.clausesById.get(ccm.clauseId);
        if (!mappedClause) continue;

        const mappedVersion = graph.versionsById.get(
          mappedClause.documentVersionId,
        );
        if (!mappedVersion) continue;

        const document = graph.documentsById.get(mappedVersion.documentId);
        if (!document) continue;

        const versions =
          graph.versionsByDocumentId.get(document.id) ?? [];
        const applicable =
          versionSelectionBasis === "CASE_DATE" && caseDate
            ? selectApplicableVersionAt(versions, caseDate)
            : selectCurrentApplicableVersion(versions, now);
        if (!applicable) continue;

        const byKey = graph.clausesByVersionKey.get(applicable.id);
        const clauseOnApplicable = byKey?.get(mappedClause.clauseKey);
        if (!clauseOnApplicable) continue;

        const dedupeKey = `${control.id}::${clauseOnApplicable.id}::${ccm.relationType}`;
        let bucket = buckets.get(dedupeKey);
        if (!bucket) {
          bucket = {
            control,
            document,
            version: applicable,
            clause: clauseOnApplicable,
            relationType: ccm.relationType,
            mappingRationales: [],
            mappingRequired: [],
            mappingEvidence: [],
            mappingChecklist: [],
            ruleContributions: [],
            versionSelectionBasis,
            caseDate,
          };
          buckets.set(dedupeKey, bucket);
        }
        bucket.mappingRationales.push(ccm.rationale);
        bucket.mappingRequired.push(
          ...ccm.requiredContext,
          ...control.requiredContext,
          ...rc.requiredContext,
        );
        bucket.mappingEvidence.push(
          ...ccm.suggestedEvidence,
          ...control.suggestedEvidence,
        );
        bucket.mappingChecklist.push(
          ...ccm.suggestedChecklistItems,
          ...control.suggestedChecklistItems,
        );
        bucket.ruleContributions.push({
          ruleId,
          priority: rc.priority,
          evidenceIds: evidenceByRule.get(ruleId) ?? [],
        });
      }
    }
  }

  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const findings: CaseComplianceFinding[] = [];

  for (const bucket of buckets.values()) {
    // 按 key 去重 requiredContext
    const reqMap = new Map<string, ContextRequirement>();
    for (const r of bucket.mappingRequired) reqMap.set(r.key, r);
    const requirements = [...reqMap.values()];
    const missingContext = resolveMissingContext(requirements, availableKeys);
    const { ruleId, supportingRuleIds, evidenceIds } = pickPrimaryRule(
      bucket.ruleContributions,
    );
    const relevance = resolveFindingRelevance({
      relationType: bucket.relationType,
      missingContext,
      evidenceIds,
    });

    const rationaleParts = [
      ...new Set(bucket.mappingRationales.filter(Boolean)),
    ];
    const rationale = [
      `基于命中规则 ${[ruleId, ...supportingRuleIds].join("、")} 关联控制 ${bucket.control.controlCode}。`,
      `静态关系：${bucket.relationType}（非违法结论）。`,
      ...rationaleParts.slice(0, 2),
      missingContext.length > 0
        ? `缺少上下文：${missingContext.map((m) => m.label).join("、")}。`
        : null,
      `版本选择：${bucket.versionSelectionBasis}${
        bucket.caseDate ? `（案件日期 ${bucket.caseDate}）` : "（当前日期）"
      } → ${bucket.version.versionKey}。`,
    ]
      .filter(Boolean)
      .join(" ");

    findings.push({
      ruleId,
      supportingRuleIds,
      evidenceIds,
      controlId: bucket.control.id,
      controlCode: bucket.control.controlCode,
      documentId: bucket.document.id,
      documentCanonicalCode: bucket.document.canonicalCode,
      documentVersionId: bucket.version.id,
      versionKey: bucket.version.versionKey,
      clauseId: bucket.clause.id,
      clauseKey: bucket.clause.clauseKey,
      relationType: bucket.relationType,
      relevance,
      rationale,
      missingContext,
      suggestedEvidence: mergeSuggestions([bucket.mappingEvidence]),
      suggestedChecklist: mergeSuggestions([bucket.mappingChecklist]),
      versionSelectionBasis: bucket.versionSelectionBasis,
      caseDate: bucket.caseDate,
    });
  }

  findings.sort((a, b) => {
    const rr = RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance];
    if (rr !== 0) return rr;
    const cc = a.controlCode.localeCompare(b.controlCode);
    if (cc !== 0) return cc;
    return a.clauseKey.localeCompare(b.clauseKey);
  });

  const topN = input.topN ?? 12;
  const limited = findings.slice(0, topN);

  const snapshots: ComplianceReferenceSnapshot[] = limited.map((f) => {
    const version = [
      ...(graph.versionsByDocumentId.get(f.documentId) ?? []),
    ].find((v) => v.id === f.documentVersionId);
    const clause = graph.clausesById.get(f.clauseId);
    const document = graph.documentsById.get(f.documentId);
    return {
      documentId: f.documentId,
      documentVersionId: f.documentVersionId,
      documentCanonicalCode: f.documentCanonicalCode,
      documentTitle: document?.title ?? f.documentCanonicalCode,
      versionKey: f.versionKey,
      versionLabel: version?.versionLabel ?? f.versionKey,
      clauseId: f.clauseId,
      clauseKey: f.clauseKey,
      articleNumber: clause?.articleNumber ?? null,
      clauseHeading: clause?.heading ?? null,
      relationType: f.relationType,
      rationaleSnapshot: f.rationale,
      sourceUrl: version?.sourceUrl ?? null,
      capturedAt,
      caseDate: f.caseDate,
      versionSelectionBasis: f.versionSelectionBasis,
      controlId: f.controlId,
      controlCode: f.controlCode,
      ruleId: f.ruleId,
      supportingRuleIds: f.supportingRuleIds,
      evidenceIds: f.evidenceIds,
      relevance: f.relevance,
    };
  });

  return {
    findings: limited,
    snapshots,
    caseDate,
    versionSelectionBasis,
    hitRuleIds,
    skippedUnknownRuleIds,
  };
}

/** 从 DB 加载解析所需 Knowledge 子图（只读） */
export async function loadKnowledgeResolutionGraph(
  hitRuleIds: readonly string[],
  db: KnowledgeDbClient = prisma,
): Promise<KnowledgeResolutionGraph> {
  const ruleMaps =
    hitRuleIds.length === 0
      ? []
      : await db.ruleControlMapping.findMany({
          where: { ruleId: { in: [...hitRuleIds] } },
        });

  const controlIds = [...new Set(ruleMaps.map((m) => m.controlId))];
  const controls =
    controlIds.length === 0
      ? []
      : await db.complianceControl.findMany({
          where: { id: { in: controlIds } },
        });

  const clauseMaps =
    controlIds.length === 0
      ? []
      : await db.controlClauseMapping.findMany({
          where: { controlId: { in: controlIds }, reviewStatus: "APPROVED" },
        });

  const mappedClauseIds = [...new Set(clauseMaps.map((m) => m.clauseId))];
  const mappedClauses =
    mappedClauseIds.length === 0
      ? []
      : await db.complianceClause.findMany({
          where: { id: { in: mappedClauseIds } },
        });

  const versionIds = [...new Set(mappedClauses.map((c) => c.documentVersionId))];
  const mappedVersions =
    versionIds.length === 0
      ? []
      : await db.complianceDocumentVersion.findMany({
          where: { id: { in: versionIds } },
        });

  const documentIds = [...new Set(mappedVersions.map((v) => v.documentId))];
  const documents =
    documentIds.length === 0
      ? []
      : await db.complianceDocument.findMany({
          where: { id: { in: documentIds } },
        });

  const allVersions =
    documentIds.length === 0
      ? []
      : await db.complianceDocumentVersion.findMany({
          where: { documentId: { in: documentIds } },
        });

  const allVersionIds = allVersions.map((v) => v.id);
  const allClauses =
    allVersionIds.length === 0
      ? []
      : await db.complianceClause.findMany({
          where: { documentVersionId: { in: allVersionIds } },
        });

  const documentsById = new Map(
    documents.map((r) => [r.id, mapComplianceDocument(r)]),
  );
  const versionsById = new Map<string, ComplianceDocumentVersion>();
  const versionsByDocumentId = new Map<string, ComplianceDocumentVersion[]>();
  for (const row of allVersions) {
    const v = mapComplianceDocumentVersion(row);
    versionsById.set(v.id, v);
    const list = versionsByDocumentId.get(v.documentId) ?? [];
    list.push(v);
    versionsByDocumentId.set(v.documentId, list);
  }

  const clausesById = new Map<string, ComplianceClause>();
  const clausesByVersionKey = new Map<string, Map<string, ComplianceClause>>();
  for (const row of allClauses) {
    const c = mapComplianceClause(row);
    clausesById.set(c.id, c);
    let byKey = clausesByVersionKey.get(c.documentVersionId);
    if (!byKey) {
      byKey = new Map();
      clausesByVersionKey.set(c.documentVersionId, byKey);
    }
    byKey.set(c.clauseKey, c);
  }

  const controlsById = new Map(
    controls.map((r) => [r.id, mapComplianceControl(r)]),
  );

  const ruleControlByRuleId = new Map<string, RuleControlMapping[]>();
  for (const row of ruleMaps) {
    const m = mapRuleControlMapping(row);
    const list = ruleControlByRuleId.get(m.ruleId) ?? [];
    list.push(m);
    ruleControlByRuleId.set(m.ruleId, list);
  }

  const controlClauseByControlId = new Map<string, ControlClauseMapping[]>();
  for (const row of clauseMaps) {
    const m = mapControlClauseMapping(row);
    const list = controlClauseByControlId.get(m.controlId) ?? [];
    list.push(m);
    controlClauseByControlId.set(m.controlId, list);
  }

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

/**
 * Case 运行时入口：加载 Knowledge 子图并解析。
 */
export async function resolveCaseCompliance(
  input: ResolveCaseComplianceInput,
  db: KnowledgeDbClient = prisma,
): Promise<ResolveCaseComplianceResult> {
  const knownRuleIds =
    input.knownRuleIds ?? new Set(allRules.map((r) => r.ruleId));
  const { hitRuleIds } = collectHitRuleIds(input.analysisResults, knownRuleIds);
  const graph = await loadKnowledgeResolutionGraph(hitRuleIds, db);
  return resolveCaseComplianceFromGraph(input, graph);
}
