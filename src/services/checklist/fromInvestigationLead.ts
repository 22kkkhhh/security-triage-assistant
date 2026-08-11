/**
 * Investigation Lead → MANUAL ChecklistItem（纯函数）。
 * origin=MANUAL；provenance=INVESTIGATION_LEAD。
 */

import type { ChecklistItem, ChecklistSourceRef } from "@/domain/types";
import type {
  HistoricalSignal,
  InvestigationLeadCode,
} from "@/services/correlation/investigationIntelligenceTypes";
import {
  investigationLeadChecklistCategories,
  investigationLeadChecklistLabels,
  investigationLeadKey,
  investigationLeadPrimarySignal,
} from "./investigationLeadCanonical";

export function isInvestigationLeadChecklistItem(
  item: ChecklistItem,
): boolean {
  return (
    item.sourceKind === "INVESTIGATION_LEAD" &&
    typeof item.sourceRef?.leadKey === "string" &&
    item.sourceRef.leadKey.length > 0
  );
}

export function findChecklistItemByLeadKey(
  items: readonly ChecklistItem[],
  leadKey: string,
): ChecklistItem | undefined {
  return items.find(
    (item) =>
      isInvestigationLeadChecklistItem(item) &&
      item.sourceRef!.leadKey === leadKey,
  );
}

export function hasInvestigationLeadInChecklist(
  items: readonly ChecklistItem[],
  leadKey: string,
): boolean {
  return Boolean(findChecklistItemByLeadKey(items, leadKey));
}

export function buildInvestigationLeadSourceRef(input: {
  leadCode: InvestigationLeadCode;
  relatedCaseIds: readonly string[];
  signals?: readonly HistoricalSignal[];
}): ChecklistSourceRef {
  const leadKey = investigationLeadKey(input.leadCode);
  const primary = investigationLeadPrimarySignal[input.leadCode];
  const signalCodes = (input.signals ?? [])
    .filter((s) => !primary || s.code === primary)
    .map((s) => s.code);
  const uniqueSignals = [...new Set(signalCodes)].sort();

  return {
    leadKey,
    leadCode: input.leadCode,
    relatedCaseIds: [...input.relatedCaseIds].sort(),
    signalCodes: uniqueSignals,
  };
}

/**
 * 从已验证的 Lead 创建 MANUAL ChecklistItem（不写入 DB）。
 * id 含随机后缀；去重依赖 leadKey。
 */
export function createChecklistItemFromInvestigationLead(
  input: {
    leadCode: InvestigationLeadCode;
    relatedCaseIds: readonly string[];
    signals?: readonly HistoricalSignal[];
  },
  idSuffix: string = cryptoRandomSuffix(),
): ChecklistItem {
  const sourceRef = buildInvestigationLeadSourceRef(input);
  return {
    id: `CL-IL-${sanitizeIdPart(input.leadCode)}-${idSuffix}`,
    category: investigationLeadChecklistCategories[input.leadCode],
    label: investigationLeadChecklistLabels[input.leadCode],
    completed: false,
    note: null,
    origin: "MANUAL",
    relatedRuleId: null,
    sourceKind: "INVESTIGATION_LEAD",
    sourceRef,
  };
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

function cryptoRandomSuffix(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}`;
}
