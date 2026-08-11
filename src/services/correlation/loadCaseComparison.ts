/**
 * Server-side 两案对比加载：仅取两个 Case，不扫 30 天窗口。
 */

import { getCaseById } from "@/services/persistence/caseRepository";
import { buildCaseComparison } from "./buildCaseComparison";
import type { CaseComparisonView } from "./caseComparisonTypes";
import { toComparisonCaseSource } from "./toComparisonCaseSource";

export type LoadCaseComparisonResult =
  | { status: "NOT_FOUND"; missing: "CURRENT" | "RELATED" | "BOTH" }
  | { status: "OK"; comparison: CaseComparisonView };

export async function loadCaseComparison(
  currentCaseId: string,
  relatedCaseId: string,
): Promise<LoadCaseComparisonResult> {
  const [current, related] = await Promise.all([
    getCaseById(currentCaseId),
    currentCaseId === relatedCaseId
      ? Promise.resolve(null)
      : getCaseById(relatedCaseId),
  ]);

  if (currentCaseId === relatedCaseId) {
    if (!current) {
      return { status: "NOT_FOUND", missing: "CURRENT" };
    }
    const source = toComparisonCaseSource(current);
    return {
      status: "OK",
      comparison: buildCaseComparison({ current: source, related: source }),
    };
  }

  if (!current && !related) {
    return { status: "NOT_FOUND", missing: "BOTH" };
  }
  if (!current) {
    return { status: "NOT_FOUND", missing: "CURRENT" };
  }
  if (!related) {
    return { status: "NOT_FOUND", missing: "RELATED" };
  }

  return {
    status: "OK",
    comparison: buildCaseComparison({
      current: toComparisonCaseSource(current),
      related: toComparisonCaseSource(related),
    }),
  };
}
