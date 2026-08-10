/**
 * Case 详情页 Server 数据加载：同一 persisted state 只 analyze 一次。
 */
import { loadCaseWorkbenchRuntimeViewsFromAnalyzed } from "@/app/(app)/cases/loadCaseWorkbenchRuntime";
import { analyzePersistedCase } from "@/services/analysis/analyzePersistedCase";
import { restoreWorkbenchFromAnalyzed } from "@/services/persistence/restoreWorkbench";
import type { PersistedCase } from "@/services/persistence/types";

export async function loadCaseDetailPageData(record: PersistedCase) {
  const { draft, analyzed } = analyzePersistedCase(record);
  const [initial, runtimeViews] = await Promise.all([
    Promise.resolve(restoreWorkbenchFromAnalyzed(record, draft, analyzed)),
    loadCaseWorkbenchRuntimeViewsFromAnalyzed(record, draft, analyzed),
  ]);
  return { initial, runtimeViews, draft, analyzed };
}
