/**
 * v1.2 RC Fix smoke（自动化部分）。
 * 浏览器 A–J 人工点验不在此脚本声称通过。
 */
import "dotenv/config";
import { caseA, caseB } from "../src/domain/demo";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import {
  applyChecklistCommand,
  createCaseWithAudit,
} from "../src/services/caseCommands";
import { createManualChecklistItem } from "../src/services/checklist/generateChecklist";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { listCaseAuditLogs } from "../src/services/persistence/auditRepository";
import type { SaveCaseStateInput } from "../src/services/persistence/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function toNextState(
  record: {
    caseState: {
      caseData: SaveCaseStateInput["caseData"];
      businessContext: SaveCaseStateInput["businessContext"];
      checklist: SaveCaseStateInput["checklist"];
      humanReview: SaveCaseStateInput["humanReview"];
      timeline: SaveCaseStateInput["timeline"];
    };
    suggestedRiskLevel: SaveCaseStateInput["suggestedRiskLevel"];
    status: NonNullable<SaveCaseStateInput["status"]>;
  },
  patch: Partial<SaveCaseStateInput> = {},
): SaveCaseStateInput {
  return {
    caseData: record.caseState.caseData,
    businessContext: record.caseState.businessContext,
    checklist: record.caseState.checklist,
    humanReview: record.caseState.humanReview,
    timeline: record.caseState.timeline,
    suggestedRiskLevel: record.suggestedRiskLevel,
    status: record.status,
    ...patch,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  assert(url, "DATABASE_URL 未设置");
  await resetPrismaClient(url);

  // A. Case A Timeline / Audit 语义
  assert(
    !caseA.timeline.some((e) => e.title.includes("开始人工核查")),
    "Case A 仍含运营操作 Timeline",
  );
  assert(
    !caseA.timeline.some((e) => e.eventType === "人工处置"),
    "Case A Timeline 仍含人工处置类型",
  );
  const seedAudits = await prisma.caseAuditLog.findMany({
    where: { caseId: "demo-case-a" },
    orderBy: { createdAt: "asc" },
  });
  if (seedAudits.length > 0) {
    const actions = seedAudits.map((a) => a.actionType);
    for (const need of [
      "BUSINESS_CONTEXT_UPDATED",
      "HUMAN_REVIEW_UPDATED",
      "REPORT_CREATED",
      "STATUS_CHANGED",
      "REPORT_EXPORTED",
    ] as const) {
      assert(actions.includes(need), `Case A Audit 缺少 ${need}`);
    }
  }

  // B/C. SYSTEM / MANUAL Checklist
  await prisma.caseAuditLog.deleteMany({
    where: { caseId: { startsWith: "smoke-rc-" } },
  });
  // 使用临时案件
  const analyzed = analyzeSecurityCase(caseA);
  const created = await createCaseWithAudit(
    {
      draft: { ...caseA, name: "RC Fix Smoke Case" },
      checklist: analyzed.checklist,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    },
    { operationId: `smoke-rc-create-${Date.now()}` },
  );
  assert(created.ok, "创建 smoke 案件失败");
  if (!created.ok) return;

  const systemItem = created.case.caseState.checklist.find(
    (x) => x.origin === "SYSTEM",
  );
  assert(systemItem, "无 SYSTEM checklist");
  const reject = await applyChecklistCommand({
    caseId: created.case.id,
    action: "delete",
    itemId: systemItem!.id,
    operationId: `smoke-rc-del-sys-${Date.now()}`,
    baseUpdatedAt: created.case.updatedAt,
    nextCaseState: toNextState(created.case, {
      checklist: created.case.caseState.checklist.filter(
        (x) => x.id !== systemItem!.id,
      ),
    }),
  });
  assert(!reject.ok, "SYSTEM 删除应失败");
  assert(
    !reject.ok && reject.error.includes("系统生成的核查事项不能删除"),
    "SYSTEM 删除错误文案不符",
  );

  const manual = createManualChecklistItem({
    category: "BUSINESS",
    label: "Smoke 人工项",
  });
  const added = await applyChecklistCommand({
    caseId: created.case.id,
    action: "add",
    itemId: manual.id,
    operationId: `smoke-rc-add-${Date.now()}`,
    baseUpdatedAt: created.case.updatedAt,
    nextCaseState: toNextState(created.case, {
      checklist: [...created.case.caseState.checklist, manual],
    }),
  });
  assert(added.ok, "MANUAL 新增失败");
  if (!added.ok) return;
  const delManual = await applyChecklistCommand({
    caseId: created.case.id,
    action: "delete",
    itemId: manual.id,
    operationId: `smoke-rc-del-man-${Date.now()}`,
    baseUpdatedAt: added.case.updatedAt,
    nextCaseState: toNextState(added.case, {
      checklist: added.case.caseState.checklist.filter((x) => x.id !== manual.id),
    }),
  });
  assert(delManual.ok, "MANUAL 删除应成功");
  if (delManual.ok) {
    assert(
      delManual.audit?.actionType === "CHECKLIST_DELETED",
      "缺少 CHECKLIST_DELETED",
    );
  }

  // D. DATA-003 时间
  const a = analyzeSecurityCase(caseA);
  const e = a.evidences.find((x) => x.evidenceId.includes("DATA-003"));
  assert(e, "缺少 DATA-003 evidence");
  assert(e!.summary.includes("2026-08-08 01:30:00"), "DATA-003 缺可读时间");
  assert(!e!.summary.includes("T01:30"), "DATA-003 仍含 ISO T");
  assert(!e!.summary.includes("+08:00"), "DATA-003 仍含 +08:00");

  // Case B 结论不变
  assert(
    caseB.humanReview?.finalConclusion === "SUSPECTED_SECURITY_INCIDENT",
    "Case B 结论被改",
  );
  assert(
    caseA.humanReview?.finalConclusion === "NORMAL_BUSINESS",
    "Case A 结论被改",
  );

  const logs = await listCaseAuditLogs({ caseId: created.case.id, limit: 20 });
  assert(logs.items.length > 0, "smoke 案件应有 Audit");

  // cleanup smoke case
  await prisma.caseAuditLog.deleteMany({ where: { caseId: created.case.id } });
  await prisma.caseRecord.delete({ where: { id: created.case.id } });

  console.log("smoke-v12-rc-fix: OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
