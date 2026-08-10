/**
 * Server-side Related Cases 加载：CASE_READ 页面调用。
 * 扫描窗口内 CaseRecord（含 caseState），在服务端做确定性关联。
 */

import { prisma } from "@/lib/prisma";
import { rowToPersistedCase } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";
import { extractCorrelationFacts } from "./extractCorrelationFacts";
import { findRelatedCases } from "./findRelatedCases";
import {
  RELATED_CASES_RESULT_CAP,
  RELATED_CASES_SCAN_CAP,
  RELATED_CASES_WINDOW_DAYS,
  type RelatedCaseItem,
} from "./types";

export async function loadRelatedCasesForCase(
  current: PersistedCase,
): Promise<RelatedCaseItem[]> {
  const since = new Date(
    Date.now() - RELATED_CASES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await prisma.caseRecord.findMany({
    where: {
      id: { not: current.id },
      lastActivityAt: { gte: since },
    },
    orderBy: [{ lastActivityAt: "desc" }, { updatedAt: "desc" }],
    take: RELATED_CASES_SCAN_CAP,
  });

  const currentFacts = extractCorrelationFacts(current);
  const candidates = rows.map((row) =>
    extractCorrelationFacts(rowToPersistedCase(row)),
  );

  return findRelatedCases(currentFacts, candidates, {
    limit: RELATED_CASES_RESULT_CAP,
  });
}
