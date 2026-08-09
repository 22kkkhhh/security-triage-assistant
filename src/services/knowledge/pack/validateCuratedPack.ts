/**
 * Curated pack 静态校验（importer 边界 fail closed）。
 */
import {
  assertClauseTextForContentMode,
  assertKnownRuleId,
  assertRightsContentMode,
  assertVersionDateWindow,
  CONTROL_CLAUSE_RELATIONS,
  KnowledgeDomainError,
  RULE_CONTROL_RELATIONS,
  parseEnumValue,
} from "@/domain/knowledge";
import { allRules } from "@/services/analysis/runRules";
import type { CuratedKnowledgePack } from "./types";

const executableRuleIds = () => new Set(allRules.map((r) => r.ruleId));

export function validateCuratedPack(pack: CuratedKnowledgePack): void {
  if (!pack.packId || !pack.packVersion) {
    throw new KnowledgeDomainError("PACK_META", "packId/packVersion 必填");
  }

  const docCodes = new Set<string>();
  const clauseIndex = new Set<string>();

  for (const doc of pack.documents) {
    if (docCodes.has(doc.canonicalCode)) {
      throw new KnowledgeDomainError(
        "PACK_DUP_DOC",
        `重复 canonicalCode：${doc.canonicalCode}`,
      );
    }
    docCodes.add(doc.canonicalCode);

    const v = doc.version;
    assertRightsContentMode(v.rightsStatus, v.contentMode);
    assertVersionDateWindow(v.effectiveDate, v.expiryDate);

    if (v.publicationStatus !== "PUBLISHED") {
      throw new KnowledgeDomainError(
        "PACK_PUBLICATION",
        `${doc.canonicalCode} 正式 pack 版本须为 PUBLISHED`,
      );
    }

    // GB/T 第一版强制 SUMMARY_ONLY（权利未确认，禁止全文灌库）
    if (
      doc.canonicalCode === "CN-GBT-22239" &&
      v.contentMode !== "SUMMARY_ONLY"
    ) {
      throw new KnowledgeDomainError(
        "PACK_GBT_MODE",
        "CN-GBT-22239 第一版必须 SUMMARY_ONLY",
      );
    }

    const keys = new Set<string>();
    for (const clause of v.clauses) {
      if (keys.has(clause.clauseKey)) {
        throw new KnowledgeDomainError(
          "PACK_DUP_CLAUSE",
          `${doc.canonicalCode}/${clause.clauseKey} 重复`,
        );
      }
      keys.add(clause.clauseKey);
      assertClauseTextForContentMode(v.contentMode, clause.originalText);
      if (clause.parentClauseKey && !keys.has(clause.parentClauseKey)) {
        // parent 必须已出现（同 version 内前向声明）
        const parentExists = v.clauses.some(
          (c) => c.clauseKey === clause.parentClauseKey,
        );
        if (!parentExists) {
          throw new KnowledgeDomainError(
            "PACK_PARENT",
            `${clause.clauseKey} parentClauseKey 不存在于同版本`,
          );
        }
      }
      clauseIndex.add(
        `${doc.canonicalCode}::${v.versionKey}::${clause.clauseKey}`,
      );
    }
  }

  const controlCodes = new Set<string>();
  for (const control of pack.controls) {
    if (controlCodes.has(control.controlCode)) {
      throw new KnowledgeDomainError(
        "PACK_DUP_CTRL",
        `重复 controlCode：${control.controlCode}`,
      );
    }
    controlCodes.add(control.controlCode);
  }

  const knownRules = executableRuleIds();
  const rcSeen = new Set<string>();
  for (const m of pack.ruleControlMappings) {
    assertKnownRuleId(m.ruleId, knownRules);
    parseEnumValue(m.relation, RULE_CONTROL_RELATIONS, "relation");
    if (!controlCodes.has(m.controlCode)) {
      throw new KnowledgeDomainError(
        "PACK_RC_CTRL",
        `RuleControlMapping 未知 control：${m.controlCode}`,
      );
    }
    const key = `${m.ruleId}::${m.controlCode}`;
    if (rcSeen.has(key)) {
      throw new KnowledgeDomainError("PACK_RC_DUP", `重复 RuleControl：${key}`);
    }
    rcSeen.add(key);
  }

  // 全部可执行规则至少有一条 PRIMARY 或任意映射
  for (const ruleId of knownRules) {
    if (![...rcSeen].some((k) => k.startsWith(`${ruleId}::`))) {
      throw new KnowledgeDomainError(
        "PACK_RC_COVERAGE",
        `可执行规则缺少 RuleControlMapping：${ruleId}`,
      );
    }
  }

  const ccSeen = new Set<string>();
  for (const m of pack.controlClauseMappings) {
    // CONTROL_CLAUSE_RELATIONS 不含 INSUFFICIENT_CONTEXT（运行时 relevance 专用）
    parseEnumValue(m.relationType, CONTROL_CLAUSE_RELATIONS, "relationType");
    if (!controlCodes.has(m.controlCode)) {
      throw new KnowledgeDomainError(
        "PACK_CC_CTRL",
        `ControlClauseMapping 未知 control：${m.controlCode}`,
      );
    }
    const clauseRef = `${m.documentCanonicalCode}::${m.versionKey}::${m.clauseKey}`;
    if (!clauseIndex.has(clauseRef)) {
      throw new KnowledgeDomainError(
        "PACK_CC_CLAUSE",
        `ControlClauseMapping 未知 clause：${clauseRef}`,
      );
    }
    const key = `${m.controlCode}::${clauseRef}::${m.relationType}`;
    if (ccSeen.has(key)) {
      throw new KnowledgeDomainError("PACK_CC_DUP", `重复 ControlClause：${key}`);
    }
    ccSeen.add(key);
  }
}
