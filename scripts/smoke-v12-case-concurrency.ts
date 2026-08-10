import { businessContextSemanticPatch } from "@/test-utils/semanticCommandIntents";
/**
 * Case 双 Tab lost-update 回归：
 * Tab A status → RESPONDING
 * Tab B 旧 BC → AUTHORIZED（或翻转）
 * 最终 status 仍为 RESPONDING，且无 stale BC Audit。
 */
import "dotenv/config";
import { systemActor } from "../src/services/audit/auditEventBuilder";
import { caseB } from "../src/domain/demo";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import {
  changeCaseStatusCommand,
  createCaseWithAudit,
  updateBusinessContextCommand,
} from "../src/services/caseCommands";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { listCaseAuditLogs } from "../src/services/persistence/auditRepository";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}


async function main() {
  const url = process.env.DATABASE_URL;
  assert(url, "DATABASE_URL 未设置");
  await resetPrismaClient(url);

  const analyzed = analyzeSecurityCase(caseB);
  const created = await createCaseWithAudit(
    {
      draft: { ...caseB, name: "Concurrency Smoke Case B" },
      checklist: analyzed.checklist,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    },
    { operationId: `smoke-cc-create-${Date.now()}`, actor: systemActor()
},
  );
  assert(created.ok, "创建失败");
  if (!created.ok) return;

  const v1 = created.case;
  assert(v1.status === "INVESTIGATING", "初始状态应为研判中");

  const tabA = await changeCaseStatusCommand({
    caseId: v1.id,
    nextStatus: "RESPONDING",
    operationId: `smoke-cc-status-${Date.now()}`,
    baseUpdatedAt: v1.updatedAt,
     actor: systemActor()
});
  assert(tabA.ok, `Tab A 状态修改失败: ${!tabA.ok ? tabA.error : ""}`);
  if (!tabA.ok) return;
  assert(tabA.case.status === "RESPONDING", "Tab A 后应为处置中");

  const targetLegitimacy =
    v1.caseState.businessContext.businessLegitimacy === "AUTHORIZED"
      ? "UNAUTHORIZED"
      : "AUTHORIZED";

  const tabB = await updateBusinessContextCommand({
    caseId: v1.id,
    operationId: `smoke-cc-bc-${Date.now()}`,
    baseUpdatedAt: v1.updatedAt,
    businessContextPatch: businessContextSemanticPatch({
        ...v1.caseState.businessContext,
        businessLegitimacy: targetLegitimacy,
      }), actor: systemActor()
});
  assert(!tabB.ok, "Tab B 应 STALE");
  assert(!tabB.ok && tabB.code === "STALE", "Tab B 应返回 STALE code");

  const final = await prisma.caseRecord.findUnique({ where: { id: v1.id } });
  assert(final, "案件应存在");
  assert(final!.status === "RESPONDING", `最终状态被覆盖为 ${final!.status}`);

  const state = final!.caseState as {
    businessContext: { businessLegitimacy: string };
  };
  assert(
    state.businessContext.businessLegitimacy !== targetLegitimacy ||
      v1.caseState.businessContext.businessLegitimacy === targetLegitimacy,
    "stale BC 不应写入",
  );
  assert(
    state.businessContext.businessLegitimacy ===
      v1.caseState.businessContext.businessLegitimacy,
    "BusinessContext 应保持 Tab A 成功前的 DB 值",
  );

  const logs = await listCaseAuditLogs({ caseId: v1.id });
  assert(
    logs.items.some((x) => x.actionType === "STATUS_CHANGED"),
    "应有 STATUS_CHANGED",
  );
  assert(
    !logs.items.some((x) => x.actionType === "BUSINESS_CONTEXT_UPDATED"),
    "不得有 stale BUSINESS_CONTEXT_UPDATED",
  );

  await prisma.caseAuditLog.deleteMany({ where: { caseId: v1.id } });
  await prisma.caseRecord.delete({ where: { id: v1.id } });
  console.log("smoke-v12-case-concurrency: OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
