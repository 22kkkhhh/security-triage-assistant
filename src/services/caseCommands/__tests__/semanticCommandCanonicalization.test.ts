import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { systemActor } from "@/services/audit/auditEventBuilder";
import {
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  updateBusinessContextCommand,
} from "@/services/caseCommands";
import { createChecklistItemFromComplianceSuggestion } from "@/services/checklist/fromComplianceSuggestion";
import { resetPrismaClient } from "@/lib/prisma";
import { createCase } from "@/services/persistence/caseRepository";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";

const TEST_DB_FILE = path.resolve("prisma/test-semantic-canonical.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function seedCase(draft: typeof caseA) {
  const analyzed = analyzeSecurityCase(draft);
  return createCase({
    draft,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
}

const complianceSuggestion: CaseComplianceChecklistItem = {
  key: "EVIDENCE:gateway-log",
  sourceKey: "gateway-log",
  label: "收集网关访问日志",
  kind: "EVIDENCE",
  priority: 10,
  controlCodes: ["CTRL-NETWORK-001"],
  clauseRefs: [],
  relevance: "RELEVANT",
  relationTypes: ["CONTROL_SUPPORT"],
  ruleIds: [],
  supportingRuleIds: [],
  evidenceIds: [],
};

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
  await resetPrismaClient(TEST_DB_URL);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("semantic command canonicalization：最小意图与跨字段保护", () => {
  it("status 仅变更 status；HumanReview、Checklist、BC、Timeline 均保持原值", async () => {
    const created = await seedCase(caseA);

    const result = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "CLOSED",
      operationId: "smuggle-status",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe("CLOSED");
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.businessContext).toEqual(
      created.caseState.businessContext,
    );
    expect(result.case.caseState.checklist).toEqual(created.caseState.checklist);
    expect(result.case.caseState.timeline).toEqual(created.caseState.timeline);
    expect(result.case.suggestedRiskLevel).toBe(created.suggestedRiskLevel);
  });

  it("BusinessContext 只接受四个结构化字段，快照自动保存字段保持不变", async () => {
    const created = await seedCase(caseA);
    const result = await updateBusinessContextCommand({
      caseId: created.id,
      operationId: "smuggle-bc",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),
      businessContextPatch: {
        plannedTaskStatus: created.caseState.businessContext.plannedTaskStatus,
        changeTicketStatus: created.caseState.businessContext.changeTicketStatus,
        ownerVerification: created.caseState.businessContext.ownerVerification,
        businessLegitimacy: "UNAUTHORIZED",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.caseState.businessContext.businessLegitimacy).toBe(
      "UNAUTHORIZED",
    );
    expect(result.case.caseState.businessContext.businessJustification).toBe(
      created.caseState.businessContext.businessJustification,
    );
    expect(result.case.caseState.businessContext.changeTicketId).toBe(
      created.caseState.businessContext.changeTicketId,
    );
    expect(result.case.caseState.businessContext.businessOwner).toBe(
      created.caseState.businessContext.businessOwner,
    );
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.checklist).toEqual(created.caseState.checklist);
    expect(result.case.caseState.timeline).toEqual(created.caseState.timeline);
  });

  it("checklist complete 仅完成目标项，不能影响其他持久化字段", async () => {
    const created = await seedCase(caseA);
    const target = created.caseState.checklist.find((item) => !item.completed);
    expect(target).toBeTruthy();

    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "complete",
      itemId: target!.id,
      operationId: "smuggle-cl-complete",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(created.status);
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.businessContext).toEqual(
      created.caseState.businessContext,
    );
    const completedIds = result.case.caseState.checklist
      .filter((item) => item.completed)
      .map((item) => item.id);
    expect(completedIds).toEqual([target!.id]);
  });

  it("checklist add 强制 MANUAL、completed=false、relatedRuleId=null", async () => {
    const created = await seedCase(caseA);
    const itemIntent = {
      id: "CL-MINIMAL-1",
      category: "IDENTITY" as const,
      label: "人工补充核查",
      note: "仅人工添加",
    };

    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: itemIntent.id,
      operationId: "smuggle-cl-add",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),
      itemIntent,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(created.status);
    expect(result.case.caseState.checklist).toHaveLength(
      created.caseState.checklist.length + 1,
    );
    const added = result.case.caseState.checklist.find(
      (item) => item.id === itemIntent.id,
    );
    expect(added).toMatchObject({
      ...itemIntent,
      completed: false,
      origin: "MANUAL",
      relatedRuleId: null,
    });
    expect(
      result.case.caseState.checklist.filter((item) => item.completed),
    ).toHaveLength(
      created.caseState.checklist.filter((item) => item.completed).length,
    );
  });

  it("Timeline 不接受客户端 source，服务端强制 HUMAN", async () => {
    const created = await seedCase(caseA);
    const eventIntent = {
      id: "TL-HUMAN-1",
      occurredAt: new Date().toISOString(),
      eventType: "处置",
      title: "人工记录",
      description: "合法事件",
      operator: "测试员",
    };

    const result = await addTimelineEventCommand({
      caseId: created.id,
      eventId: eventIntent.id,
      operationId: "smuggle-tl",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),
      eventIntent,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(created.status);
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    const added = result.case.caseState.timeline.at(-1);
    expect(added).toEqual({ ...eventIntent, source: "HUMAN" });
  });

  it("KNOWLEDGE_SUGGESTED 最小 intent 保留 provenance，且不改其他状态", async () => {
    const created = await seedCase(caseB);
    const knowledgeItem = createChecklistItemFromComplianceSuggestion(
      complianceSuggestion,
      "canonical",
    );

    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: knowledgeItem.id,
      operationId: "smuggle-knowledge-add",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),
      itemIntent: {
        id: knowledgeItem.id,
        category: knowledgeItem.category,
        label: knowledgeItem.label,
        note: knowledgeItem.note,
        sourceKind: "KNOWLEDGE_SUGGESTED",
        sourceRef: knowledgeItem.sourceRef,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const added = result.case.caseState.checklist.find(
      (item) => item.id === knowledgeItem.id,
    );
    expect(added?.sourceKind).toBe("KNOWLEDGE_SUGGESTED");
    expect(added?.sourceRef?.suggestionKey).toBe(complianceSuggestion.key);
    expect(added?.completed).toBe(false);
    expect(added?.relatedRuleId).toBeNull();
    expect(result.case.status).toBe(created.status);
  });
});

describe("semantic command canonicalization：服务端状态构造", () => {
  it("copyPersistedCaseState 为不同持久化 Case 生成稳定完整状态", async () => {
    const a = await seedCase(caseA);
    const b = await seedCase(caseB);
    const { copyPersistedCaseState } = await import(
      "../semanticCommandCanonicalization"
    );

    expect(copyPersistedCaseState(a)).toEqual({
      caseData: a.caseState.caseData,
      businessContext: a.caseState.businessContext,
      checklist: a.caseState.checklist,
      humanReview: a.caseState.humanReview,
      timeline: a.caseState.timeline,
      suggestedRiskLevel: a.suggestedRiskLevel,
      status: a.status,
    });
    expect(copyPersistedCaseState(b)).toEqual({
      caseData: b.caseState.caseData,
      businessContext: b.caseState.businessContext,
      checklist: b.caseState.checklist,
      humanReview: b.caseState.humanReview,
      timeline: b.caseState.timeline,
      suggestedRiskLevel: b.suggestedRiskLevel,
      status: b.status,
    });
  });
});
