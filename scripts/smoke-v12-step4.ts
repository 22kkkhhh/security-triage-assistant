/**
 * Step 4 冒烟：交接 + Activity list（无浏览器依赖）。
 */
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import { systemActor } from "../src/services/audit/auditEventBuilder";
import { caseB } from "../src/domain/demo";
import { addHandoffNoteCommand } from "../src/services/caseCommands/handoffCommands";
import { changeCaseStatusCommand } from "../src/services/caseCommands/caseCommands";
import {
  getLatestHandoffNote,
  listCaseAuditLogs,
} from "../src/services/persistence/auditRepository";
import {
  createCase,
  getCaseById,
} from "../src/services/persistence/caseRepository";
import {
  formatAuditActionLabel,
  formatAuditChangesForDisplay,
} from "../src/services/audit/formatAuditDisplay";

async function main() {
  const analyzed = analyzeSecurityCase(caseB);
  const created = await createCase({
    draft: caseB,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });

  const handoff = await addHandoffNoteCommand({
    caseId: created.id,
    note: "已完成账号核实，已联系业务负责人，等待回复。\n下一班重点核查出口网络日志。",
    operationId: `smoke-handoff-${Date.now()}`, actor: systemActor()
});
  if (!handoff.ok) throw new Error(handoff.error);

  const latest = await getLatestHandoffNote(created.id);
  if (!latest || latest.id !== handoff.audit?.id) {
    throw new Error("最新交接未更新");
  }

  const afterHandoff = await getCaseById(created.id);
  if (!afterHandoff) throw new Error("案件不存在");
  const statused = await changeCaseStatusCommand({
    caseId: created.id,
    nextStatus: "PENDING_VERIFICATION",
    operationId: `smoke-status-${Date.now()}`,
    baseUpdatedAt: afterHandoff.updatedAt,
    nextCaseState: {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: "PENDING_VERIFICATION",
    }, actor: systemActor()
});
  if (!statused.ok) throw new Error(statused.error);

  const feed = await listCaseAuditLogs({ caseId: created.id, limit: 40 });
  if (feed.items[0]?.actionType !== "STATUS_CHANGED") {
    throw new Error(
      `Feed 顶部应为最新状态变更，实际=${feed.items[0]?.actionType}`,
    );
  }
  const statusLine = formatAuditChangesForDisplay(feed.items[0]!).join(" ");
  if (statusLine.includes("INVESTIGATING") || statusLine.includes("PENDING")) {
    // PENDING may appear as Chinese; English enum must not leak
  }
  if (/\bINVESTIGATING\b|\bPENDING_VERIFICATION\b/.test(statusLine)) {
    throw new Error(`枚举泄露: ${statusLine}`);
  }
  if (formatAuditActionLabel("HANDOFF_NOTE_ADDED") !== "添加交接记录") {
    throw new Error("handoff label 不正确");
  }

  const after = await getCaseById(created.id);
  if (JSON.stringify(after!.caseState.timeline) !== JSON.stringify(created.caseState.timeline)) {
    throw new Error("Handoff 不应修改 Timeline");
  }

  console.log("Step 4 smoke OK:", {
    caseId: created.id,
    feedTop: formatAuditActionLabel(feed.items[0]!.actionType),
    latestHandoff: latest.summary.slice(0, 40),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
