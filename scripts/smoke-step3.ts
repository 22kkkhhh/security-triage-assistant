/**
 * Step 3 本地烟测：创建案件 → 修改 → 保存 → 重新加载（模拟刷新）。
 * 非正式 seed。
 */
import { caseA } from "../src/domain/demo/caseA";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import { createManualChecklistItem } from "../src/services/checklist/generateChecklist";
import {
  createCase,
  getCaseById,
  listCases,
  saveCaseState,
} from "../src/services/persistence/caseRepository";
import { restoreWorkbenchFromPersisted } from "../src/services/persistence/restoreWorkbench";

async function main() {
  const analyzed = analyzeSecurityCase(caseA);
  const created = await createCase({
    draft: caseA,
    checklist: analyzed.checklist,
    suggestedRiskLevel:
      analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });

  const checklist = created.caseState.checklist
    .map((item, i) =>
      i === 0 ? { ...item, completed: true, note: "smoke-note" } : item,
    )
    .concat(
      createManualChecklistItem({
        category: "BUSINESS",
        label: "smoke-manual",
      }),
    );

  const humanEvent = {
    id: "smoke-tl-1",
    occurredAt: "2026-08-08T21:30:00+08:00",
    eventType: "人工处置",
    title: "Smoke Timeline",
    description: "browser-equivalent save",
    operator: "王研判",
    source: "HUMAN" as const,
  };

  const saved = await saveCaseState(created.id, {
    caseData: created.caseState.caseData,
    businessContext: {
      ...created.caseState.businessContext,
      businessJustification: `${created.caseState.businessContext.businessJustification} [smoke]`,
    },
    checklist,
    humanReview: {
      reviewer: "王研判",
      finalConclusion: "NORMAL_BUSINESS",
      humanRiskLevel: "LOW",
      conclusionNote: "smoke human review",
      adjustments: [],
      confirmedAt: "2026-08-08T21:30:00+08:00",
    },
    timeline: [...created.caseState.timeline, humanEvent],
    suggestedRiskLevel: created.suggestedRiskLevel,
    status: "PENDING_VERIFICATION",
  });

  const reloaded = await getCaseById(created.id);
  if (!reloaded) throw new Error("reload failed");
  const view = restoreWorkbenchFromPersisted(reloaded);
  const listed = await listCases({ search: saved.caseNumber });

  const result = {
    id: created.id,
    caseNumber: saved.caseNumber,
    checklist0: view.initialChecklist.find((i) => i.note === "smoke-note")
      ?.completed,
    manual: view.initialChecklist.some((i) => i.label === "smoke-manual"),
    human: view.draft.humanReview?.conclusionNote,
    timeline: view.draft.timeline.some((e) => e.id === "smoke-tl-1"),
    bc: (view.draft.businessContext.businessJustification ?? "").includes(
      "[smoke]",
    ),
    statusList: listed[0]?.status,
    pending: listed[0]?.pendingChecklistCount,
    url: `/cases/${created.id}`,
  };

  console.log(JSON.stringify(result, null, 2));
  if (
    !result.checklist0 ||
    !result.manual ||
    !result.human ||
    !result.timeline ||
    !result.bc ||
    result.statusList !== "PENDING_VERIFICATION"
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
