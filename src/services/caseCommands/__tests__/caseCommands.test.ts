import { businessContextSemanticPatch, checklistAddSemanticIntent, timelineEventSemanticIntent } from "@/test-utils/semanticCommandIntents";
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { systemActor, manualActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { createChecklistItemFromComplianceSuggestion } from "@/services/checklist/fromComplianceSuggestion";
import {
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  createCaseWithAudit,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
} from "@/services/caseCommands";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import {
  createCase,
  getCaseById,
  listCases,
  saveCaseState,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-case-commands.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function toNextState(
  record: NonNullable<Awaited<ReturnType<typeof getCaseById>>>,
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

async function seedCaseA() {
  const analyzed = analyzeSecurityCase(caseA);
  return createCase({
    draft: caseA,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
}

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

describe("caseCommands（v1.2 Step 2）", () => {
  it("CASE_CREATED：创建与 Audit 同事务，actor=SYSTEM", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const result = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { sourceType: "DATABASE_AUDIT", operationId: "op-create-a", actor: systemActor()
},
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit?.actionType).toBe("CASE_CREATED");
    expect(result.audit?.actorType).toBe("SYSTEM");
    expect(result.audit?.metadata?.sourceType).toBe("DATABASE_AUDIT");
    const logs = await listCaseAuditLogs({ caseId: result.case.id });
    expect(logs.items).toHaveLength(1);
  });

  it("CASE_CREATED：operationId retry 返回同一案件，不创建第二条", async () => {
    const { prisma } = await import("@/lib/prisma");
    const analyzed = analyzeSecurityCase(caseA);
    const first = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "op-create-retry", actor: systemActor()
},
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "op-create-retry", actor: systemActor()
},
    );
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.alreadyApplied).toBe(true);
    expect(retry.case.id).toBe(first.case.id);
    expect(retry.case.updatedAt).toBe(first.case.updatedAt);
    expect(retry.case.lastActivityAt).toBe(first.case.lastActivityAt);
    expect(await prisma.caseRecord.count()).toBe(1);
    expect(await prisma.caseAuditLog.count()).toBe(1);
  });

  it("事务内 Audit 失败时业务状态不半成功", async () => {
    const created = await seedCaseA();
    const { appendCaseAudit, runInTransaction } = await import(
      "@/services/persistence/auditRepository"
    );
    const { buildStatusChangedAudit } = await import(
      "@/services/audit/auditEventBuilder"
    );

    await expect(
      runInTransaction(async (tx) => {
        await saveCaseState(
          created.id,
          toNextState(created, { status: "CLOSED" }),
          tx,
        );
        await appendCaseAudit(
          {
            caseId: created.id,
            ...buildStatusChangedAudit({
              from: "INVESTIGATING",
              to: "CLOSED",
              operationId: "dup-tx-fail", actor: manualActor("王研判")
}),
          },
          tx,
        );
        await appendCaseAudit(
          {
            caseId: created.id,
            ...buildStatusChangedAudit({
              from: "INVESTIGATING",
              to: "CLOSED",
              operationId: "dup-tx-fail", actor: manualActor("王研判")
}),
          },
          tx,
        );
      }),
    ).rejects.toThrow();

    const after = await getCaseById(created.id);
    expect(after?.status).toBe("INVESTIGATING");
    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(logs.items).toHaveLength(0);
  });

  it("STATUS_CHANGED：from 取 DB 真实值；同 status 不重复 Audit", async () => {
    const created = await seedCaseA();
    const r1 = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "op-status-1",
      baseUpdatedAt: created.updatedAt,
       actor: systemActor()
});
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.audit?.changes).toEqual({
      from: "INVESTIGATING",
      to: "PENDING_VERIFICATION",
    });

    const r2 = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "op-status-2",
      baseUpdatedAt: r1.case.updatedAt,
       actor: systemActor()
});
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.alreadyApplied).toBe(true);
    expect(r2.audit).toBeNull();

    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "STATUS_CHANGED"),
    ).toHaveLength(1);
  });

  it("STATUS_CHANGED：CLOSED 写 closedAt；reopen 清空；operationId 幂等", async () => {
    const created = await seedCaseA();
    const closed = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "CLOSED",
      operationId: "op-close-1",
      baseUpdatedAt: created.updatedAt,
       actor: systemActor()
});
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.case.closedAt).toBeTruthy();

    const retry = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "CLOSED",
      operationId: "op-close-1",
      baseUpdatedAt: closed.case.updatedAt,
       actor: systemActor()
});
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.alreadyApplied).toBe(true);

    const reopened = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "INVESTIGATING",
      operationId: "op-reopen-1",
      baseUpdatedAt: closed.case.updatedAt,
       actor: systemActor()
});
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.case.closedAt).toBeNull();
  });

  it("Checklist complete/reopen/add/delete 与幂等", async () => {
    const created = await seedCaseA();
    const item = created.caseState.checklist.find((x) => !x.completed);
    expect(item).toBeTruthy();
    if (!item) return;

    const completedList = created.caseState.checklist.map((x) =>
      x.id === item.id ? { ...x, completed: true } : x,
    );
    const c1 = await applyChecklistCommand({
      caseId: created.id,
      action: "complete",
      itemId: item.id,
      operationId: "op-cl-complete",
      baseUpdatedAt: created.updatedAt,
       actor: systemActor()
});
    expect(c1.ok).toBe(true);
    if (!c1.ok) return;
    expect(c1.audit?.actionType).toBe("CHECKLIST_COMPLETED");

    const c2 = await applyChecklistCommand({
      caseId: created.id,
      action: "complete",
      itemId: item.id,
      operationId: "op-cl-complete-2",
      baseUpdatedAt: c1.case.updatedAt,
       actor: systemActor()
});
    expect(c2.ok && c2.alreadyApplied).toBe(true);

    const reopenedList = completedList.map((x) =>
      x.id === item.id ? { ...x, completed: false } : x,
    );
    const r1 = await applyChecklistCommand({
      caseId: created.id,
      action: "reopen",
      itemId: item.id,
      operationId: "op-cl-reopen",
      baseUpdatedAt: c1.case.updatedAt,
       actor: systemActor()
});
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.audit?.actionType).toBe("CHECKLIST_REOPENED");

    const manual = createManualChecklistItem({
      category: "BUSINESS",
      label: "人工补充核查项-幂等",
    });
    const withManual = [...reopenedList, manual];
    const a1 = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: manual.id,
      operationId: "op-cl-add",
      baseUpdatedAt: r1.case.updatedAt,
      itemIntent: checklistAddSemanticIntent(withManual, manual.id), actor: systemActor()
});
    expect(a1.ok).toBe(true);
    if (!a1.ok) return;
    expect(a1.audit?.actionType).toBe("CHECKLIST_ADDED");

    const aRetry = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: manual.id,
      operationId: "op-cl-add",
      baseUpdatedAt: a1.case.updatedAt,
      itemIntent: checklistAddSemanticIntent([...withManual, { ...manual, id: "dup-should-not-apply" }], manual.id), actor: systemActor()
});
    expect(aRetry.ok && aRetry.alreadyApplied).toBe(true);
    expect(
      aRetry.ok &&
        aRetry.case.caseState.checklist.filter((x) => x.id === manual.id),
    ).toHaveLength(1);

    const d1 = await applyChecklistCommand({
      caseId: created.id,
      action: "delete",
      itemId: manual.id,
      operationId: "op-cl-del",
      baseUpdatedAt: a1.case.updatedAt,
       actor: systemActor()
});
    expect(d1.ok).toBe(true);
    if (!d1.ok) return;
    expect(d1.audit?.actionType).toBe("CHECKLIST_DELETED");
  });

  it("BusinessContext 结构化变化审计；from 来自 DB；note autosave 不审计", async () => {
    const created = await seedCaseA();
    const beforeActivity = created.lastActivityAt;
    const nextBc = {
      ...created.caseState.businessContext,
      businessLegitimacy: "UNAUTHORIZED" as const,
    };
    const r = await updateBusinessContextCommand({
      caseId: created.id,
      operationId: "op-bc-1",
      baseUpdatedAt: created.updatedAt,
      businessContextPatch: businessContextSemanticPatch(nextBc), actor: systemActor()
});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.audit?.actionType).toBe("BUSINESS_CONTEXT_UPDATED");
    expect(r.audit?.changes?.businessLegitimacy).toEqual({
      from: created.caseState.businessContext.businessLegitimacy,
      to: "UNAUTHORIZED",
    });

    await new Promise((x) => setTimeout(x, 15));
    const noteOnly = await saveCaseState(created.id, {
      ...toNextState(r.case, {
        businessContext: {
          ...nextBc,
          businessJustification: "仅更新说明文本，不应产生 Audit",
        },
      }),
    });
    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "BUSINESS_CONTEXT_UPDATED"),
    ).toHaveLength(1);
    expect(noteOnly.lastActivityAt).toBe(r.case.lastActivityAt);
    expect(new Date(r.case.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeActivity).getTime(),
    );
  });

  it("HumanReview 结论/风险变化审计；不存 note 全文；单独 note autosave 不刷", async () => {
    const created = await seedCaseA();
    await saveCaseState(created.id, {
      ...toNextState(created, {
        humanReview: {
          ...(created.caseState.humanReview ?? {
            reviewer: null,
            reviewedByUserId: null,
            finalConclusion: null,
            humanRiskLevel: null,
            conclusionNote: null,
            adjustments: [],
            confirmedAt: null,
          }),
          conclusionNote: "这是很长的研判说明，不应进入 Audit changes",
        },
      }),
    });
    const withNote = await getCaseById(created.id);
    expect(withNote).toBeTruthy();

    const r = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: "op-hr-1",
      baseUpdatedAt: withNote!.updatedAt,
      actor: systemActor(),
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
      humanRiskLevel: "HIGH",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.audit?.actionType).toBe("HUMAN_REVIEW_UPDATED");
    expect(JSON.stringify(r.audit?.changes)).not.toContain("很长的研判说明");
    expect(r.case.caseState.humanReview?.conclusionNote).toBe(
      "这是很长的研判说明，不应进入 Audit changes",
    );

    await saveCaseState(created.id, {
      ...toNextState(r.case, {
        humanReview: {
          ...r.case.caseState.humanReview!,
          conclusionNote: "又改了说明",
        },
      }),
    });
    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "HUMAN_REVIEW_UPDATED"),
    ).toHaveLength(1);
  });

  it("Timeline 人工新增审计；operationId 不重复", async () => {
    const created = await seedCaseA();
    const event = {
      id: "human-tl-test-1",
      occurredAt: "2026-08-08T12:00:00.000Z",
      eventType: "其他",
      title: "已通知业务方",
      description: "已电话联系业务负责人",
      operator: "王研判",
      source: "HUMAN" as const,
    };
    const r1 = await addTimelineEventCommand({
      caseId: created.id,
      eventId: event.id,
      operationId: "op-tl-1",
      baseUpdatedAt: created.updatedAt,
      eventIntent: timelineEventSemanticIntent([...created.caseState.timeline, event], event.id), actor: systemActor()
});
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.audit?.actionType).toBe("TIMELINE_EVENT_ADDED");

    const r2 = await addTimelineEventCommand({
      caseId: created.id,
      eventId: event.id,
      operationId: "op-tl-1",
      baseUpdatedAt: r1.case.updatedAt,
      eventIntent: timelineEventSemanticIntent([
          ...r1.case.caseState.timeline,
          { ...event, id: "should-not-add" },
        ], event.id), actor: systemActor()
});
    expect(r2.ok && r2.alreadyApplied).toBe(true);
    expect(
      r2.ok && r2.case.caseState.timeline.filter((e) => e.id === event.id),
    ).toHaveLength(1);
  });

  it("stale autosave 拒绝覆盖；lastActivityAt 仅 Audit 更新；listCases 排序", async () => {
    const a = await seedCaseA();
    await new Promise((x) => setTimeout(x, 20));
    const bAnalyzed = analyzeSecurityCase(caseB);
    const b = await createCase({
      draft: caseB,
      checklist: bAnalyzed.checklist,
      suggestedRiskLevel:
        bAnalyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const statused = await changeCaseStatusCommand({
      caseId: a.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "op-act-1",
      baseUpdatedAt: a.updatedAt,
       actor: systemActor()
});
    expect(statused.ok).toBe(true);
    if (!statused.ok) return;

    await expect(
      saveCaseState(a.id, {
        ...toNextState(a, {
          checklist: a.caseState.checklist.map((x) => ({
            ...x,
            completed: false,
          })),
        }),
        baseUpdatedAt: a.updatedAt,
      }),
    ).rejects.toBeInstanceOf(StaleCaseStateError);

    const listed = await listCases();
    expect(listed[0]!.id).toBe(a.id);
    expect(listed[0]!.lastActivityAt).toBe(statused.case.lastActivityAt);
    expect(listed.some((x) => x.id === b.id)).toBe(true);
  });

  it("Case A / Case B 结论文本不因命令层改变", () => {
    const a = analyzeSecurityCase(caseA);
    const b = analyzeSecurityCase(caseB);
    expect(caseA.humanReview?.finalConclusion).toBe("NORMAL_BUSINESS");
    expect(caseB.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
    expect(a.suggestedAssessment).toBeTruthy();
    expect(b.suggestedAssessment).toBeTruthy();
  });

  it("合规建议 → ChecklistItem 成功写入 + audit metadata", async () => {
    const created = await seedCaseA();
    const suggestion: CaseComplianceChecklistItem = {
      key: "CHECKLIST:verify-ticket",
      sourceKey: "verify-ticket",
      label: "核实该操作是否存在有效授权工单",
      kind: "CHECKLIST",
      priority: 10,
      controlCodes: ["CTRL-BUSINESS-AUTH-01"],
      clauseRefs: [
        { clauseKey: "article-27", documentCanonicalCode: "CN-DSL" },
      ],
      relevance: "RELEVANT",
      relationTypes: ["CONTROL_SUPPORT"],
      ruleIds: ["DATA-003"],
      supportingRuleIds: [],
      evidenceIds: [],
    };
    const item = createChecklistItemFromComplianceSuggestion(suggestion, "s6a");
    const next = [...created.caseState.checklist, item];
    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: item.id,
      operationId: "op-ks-add-1",
      baseUpdatedAt: created.updatedAt,
      itemIntent: checklistAddSemanticIntent(next, item.id),
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit?.actionType).toBe("CHECKLIST_ADDED");
    expect(result.audit?.metadata).toMatchObject({
      sourceKind: "KNOWLEDGE_SUGGESTED",
      sourceRef: { suggestionKey: "CHECKLIST:verify-ticket" },
    });
    const stored = result.case.caseState.checklist.find((x) => x.id === item.id);
    expect(stored?.sourceKind).toBe("KNOWLEDGE_SUGGESTED");
    expect(stored?.sourceRef?.suggestionKey).toBe("CHECKLIST:verify-ticket");
  });

  it("同一 Case 重复 suggestionKey 幂等；不同 Case 可分别加入", async () => {
    const a = await seedCaseA();
    const bAnalyzed = analyzeSecurityCase(caseB);
    const b = await createCase({
      draft: caseB,
      checklist: bAnalyzed.checklist,
      suggestedRiskLevel:
        bAnalyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const suggestion: CaseComplianceChecklistItem = {
      key: "CONTEXT:destinationRegion",
      sourceKey: "destinationRegion",
      label: "核实导出数据类型及数据去向",
      kind: "CONTEXT",
      priority: 1,
      controlCodes: ["CTRL-DATA-EXPORT-01"],
      clauseRefs: [
        { clauseKey: "article-31", documentCanonicalCode: "CN-DSL" },
      ],
      relevance: "INSUFFICIENT_CONTEXT",
      relationTypes: ["POSSIBLE_OBLIGATION"],
      ruleIds: ["NETWORK-002"],
      supportingRuleIds: [],
      evidenceIds: [],
    };

    const itemA1 = createChecklistItemFromComplianceSuggestion(
      suggestion,
      "caseA1",
    );
    const addA1 = await applyChecklistCommand({
      caseId: a.id,
      action: "add",
      itemId: itemA1.id,
      operationId: "op-ks-a1",
      baseUpdatedAt: a.updatedAt,
      itemIntent: checklistAddSemanticIntent([...a.caseState.checklist, itemA1], itemA1.id),
      actor: systemActor(),
    });
    expect(addA1.ok).toBe(true);
    if (!addA1.ok) return;

    // 不同 itemId / operationId，相同 suggestionKey → 幂等不重复
    const itemA2 = createChecklistItemFromComplianceSuggestion(
      suggestion,
      "caseA2",
    );
    const addA2 = await applyChecklistCommand({
      caseId: a.id,
      action: "add",
      itemId: itemA2.id,
      operationId: "op-ks-a2",
      baseUpdatedAt: addA1.case.updatedAt,
      itemIntent: checklistAddSemanticIntent([...addA1.case.caseState.checklist, itemA2], itemA2.id),
      actor: systemActor(),
    });
    expect(addA2.ok && addA2.alreadyApplied).toBe(true);
    expect(
      addA2.ok &&
        addA2.case.caseState.checklist.filter(
          (x) => x.sourceRef?.suggestionKey === suggestion.key,
        ),
    ).toHaveLength(1);

    const itemB = createChecklistItemFromComplianceSuggestion(
      suggestion,
      "caseB1",
    );
    const addB = await applyChecklistCommand({
      caseId: b.id,
      action: "add",
      itemId: itemB.id,
      operationId: "op-ks-b1",
      baseUpdatedAt: b.updatedAt,
      itemIntent: checklistAddSemanticIntent([...b.caseState.checklist, itemB], itemB.id),
      actor: systemActor(),
    });
    expect(addB.ok).toBe(true);
    if (!addB.ok) return;
    expect(
      addB.case.caseState.checklist.some(
        (x) => x.sourceRef?.suggestionKey === suggestion.key,
      ),
    ).toBe(true);
  });
});
