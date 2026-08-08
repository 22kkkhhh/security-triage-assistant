/**
 * Case Semantic Command 乐观并发：防止旧 Tab 完整 nextCaseState lost update。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  createCaseWithAudit,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
} from "@/services/caseCommands";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import { getCaseById, saveCaseState } from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-case-concurrency.db");
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

async function seed() {
  const analyzed = analyzeSecurityCase(caseA);
  const created = await createCaseWithAudit(
    {
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    },
    { operationId: `cc-create-${Date.now()}-${Math.random()}` },
  );
  if (!created.ok) throw new Error(created.error);
  return created.case;
}

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
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

describe("Case Semantic Command 并发（Release Blocker I）", () => {
  it("BC stale 不覆盖 Status；无 Audit；lastActivityAt 不变", async () => {
    const v1 = await seed();
    const a = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-status-a",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.case.status).toBe("RESPONDING");
    const activity = a.case.lastActivityAt;
    const auditCount = (await listCaseAuditLogs({ caseId: v1.id })).items
      .length;

    const staleTarget =
      v1.caseState.businessContext.businessLegitimacy === "UNAUTHORIZED"
        ? "UNKNOWN"
        : "UNAUTHORIZED";
    const staleBc = await updateBusinessContextCommand({
      caseId: v1.id,
      operationId: "cc-bc-stale",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        status: "INVESTIGATING",
        businessContext: {
          ...v1.caseState.businessContext,
          businessLegitimacy: staleTarget,
        },
      }),
    });
    expect(staleBc.ok).toBe(false);
    if (staleBc.ok) return;
    expect(staleBc.code).toBe("STALE");
    expect(staleBc.case?.status).toBe("RESPONDING");

    const final = await getCaseById(v1.id);
    expect(final!.status).toBe("RESPONDING");
    expect(final!.caseState.businessContext.businessLegitimacy).toBe(
      v1.caseState.businessContext.businessLegitimacy,
    );
    expect(final!.caseState.businessContext.businessLegitimacy).not.toBe(
      staleTarget,
    );
    expect(final!.lastActivityAt).toBe(activity);
    const logs = await listCaseAuditLogs({ caseId: v1.id });
    expect(logs.items).toHaveLength(auditCount);
    expect(
      logs.items.filter((x) => x.actionType === "BUSINESS_CONTEXT_UPDATED"),
    ).toHaveLength(0);
    expect(
      logs.items.filter((x) => x.actionType === "STATUS_CHANGED"),
    ).toHaveLength(1);
  });

  it("Status stale 不覆盖 BC", async () => {
    const v1 = await seed();
    const a = await updateBusinessContextCommand({
      caseId: v1.id,
      operationId: "cc-bc-a",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        businessContext: {
          ...v1.caseState.businessContext,
          businessLegitimacy: "UNAUTHORIZED",
        },
      }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const stale = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "CLOSED",
      operationId: "cc-status-stale",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        status: "CLOSED",
        businessContext: v1.caseState.businessContext,
      }),
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.code).toBe("STALE");
    const final = await getCaseById(v1.id);
    expect(final!.caseState.businessContext.businessLegitimacy).toBe(
      "UNAUTHORIZED",
    );
    expect(final!.status).not.toBe("CLOSED");
  });

  it("Checklist stale 不覆盖 BC", async () => {
    const v1 = await seed();
    const a = await updateBusinessContextCommand({
      caseId: v1.id,
      operationId: "cc-bc-b",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        businessContext: {
          ...v1.caseState.businessContext,
          businessLegitimacy: "UNAUTHORIZED",
        },
      }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const item = v1.caseState.checklist.find((x) => !x.completed)!;
    const stale = await applyChecklistCommand({
      caseId: v1.id,
      action: "complete",
      itemId: item.id,
      operationId: "cc-cl-stale",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        checklist: v1.caseState.checklist.map((x) =>
          x.id === item.id ? { ...x, completed: true } : x,
        ),
        businessContext: v1.caseState.businessContext,
      }),
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.code).toBe("STALE");
    const final = await getCaseById(v1.id);
    expect(final!.caseState.businessContext.businessLegitimacy).toBe(
      "UNAUTHORIZED",
    );
    expect(
      final!.caseState.checklist.find((x) => x.id === item.id)?.completed,
    ).toBe(false);
  });

  it("HumanReview stale 不覆盖 Checklist", async () => {
    const v1 = await seed();
    const item = v1.caseState.checklist.find((x) => !x.completed)!;
    const a = await applyChecklistCommand({
      caseId: v1.id,
      action: "complete",
      itemId: item.id,
      operationId: "cc-cl-a",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        checklist: v1.caseState.checklist.map((x) =>
          x.id === item.id ? { ...x, completed: true } : x,
        ),
      }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const stale = await updateHumanReviewCommand({
      caseId: v1.id,
      operationId: "cc-hr-stale",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        humanReview: {
          ...(v1.caseState.humanReview ?? {
            reviewer: null,
            finalConclusion: null,
            humanRiskLevel: null,
            conclusionNote: null,
            adjustments: [],
            confirmedAt: null,
          }),
          finalConclusion: "INCONCLUSIVE",
          humanRiskLevel: "MEDIUM",
        },
        checklist: v1.caseState.checklist,
      }),
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.code).toBe("STALE");
    const final = await getCaseById(v1.id);
    expect(
      final!.caseState.checklist.find((x) => x.id === item.id)?.completed,
    ).toBe(true);
    expect(final!.caseState.humanReview?.finalConclusion).toBe(
      v1.caseState.humanReview?.finalConclusion,
    );
  });

  it("Timeline 新增后旧 BC 不得抹掉 Timeline", async () => {
    const v1 = await seed();
    const event = {
      id: "cc-tl-1",
      occurredAt: "2026-08-08T15:00:00+08:00",
      eventType: "其他",
      title: "补充事实",
      description: "并发测试事件事实",
      operator: "王研判",
      source: "HUMAN" as const,
    };
    const a = await addTimelineEventCommand({
      caseId: v1.id,
      eventId: event.id,
      operationId: "cc-tl-a",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        timeline: [...v1.caseState.timeline, event],
      }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const stale = await updateBusinessContextCommand({
      caseId: v1.id,
      operationId: "cc-bc-after-tl",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        businessContext: {
          ...v1.caseState.businessContext,
          businessLegitimacy: "UNAUTHORIZED",
        },
        timeline: v1.caseState.timeline,
      }),
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.code).toBe("STALE");
    const final = await getCaseById(v1.id);
    expect(final!.caseState.timeline.some((e) => e.id === event.id)).toBe(true);
  });

  it("Status vs Status：后到的旧版本必须 STALE", async () => {
    const v1 = await seed();
    const a = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-status-vs-a",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const b = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "CLOSED",
      operationId: "cc-status-vs-b",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "CLOSED" }),
    });
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.code).toBe("STALE");
    expect((await getCaseById(v1.id))!.status).toBe("RESPONDING");
  });

  it("operationId retry：旧 baseUpdatedAt 仍 alreadyApplied，不 STALE、不重复 Audit", async () => {
    const v1 = await seed();
    const first = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-retry-op",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const logs1 = await listCaseAuditLogs({ caseId: v1.id });

    const retry = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-retry-op",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.alreadyApplied).toBe(true);
    expect(retry.case.updatedAt).toBe(first.case.updatedAt);
    expect(retry.case.status).toBe("RESPONDING");
    const logs2 = await listCaseAuditLogs({ caseId: v1.id });
    expect(logs2.items).toHaveLength(logs1.items.length);
  });

  it("成功 Command 返回 DB 真实 updatedAt，可作为下一次 base", async () => {
    const v1 = await seed();
    const a = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-chain-1",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.case.updatedAt).not.toBe(v1.updatedAt);

    const b = await updateBusinessContextCommand({
      caseId: v1.id,
      operationId: "cc-chain-2",
      baseUpdatedAt: a.case.updatedAt,
      nextCaseState: toNextState(a.case, {
        businessContext: {
          ...a.case.caseState.businessContext,
          businessLegitimacy:
            a.case.caseState.businessContext.businessLegitimacy === "AUTHORIZED"
              ? "UNKNOWN"
              : "AUTHORIZED",
        },
      }),
    });
    expect(b.ok).toBe(true);
  });

  it("pending autosave 旧 base 不会覆盖 Semantic Command", async () => {
    const v1 = await seed();
    const a = await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-autosave-race",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    await expect(
      saveCaseState(
        v1.id,
        toNextState(v1, {
          status: "INVESTIGATING",
          businessContext: {
            ...v1.caseState.businessContext,
            businessJustification: "旧 autosave 备注",
          },
          baseUpdatedAt: v1.updatedAt,
        }),
      ),
    ).rejects.toMatchObject({ code: "STALE" });

    const final = await getCaseById(v1.id);
    expect(final!.status).toBe("RESPONDING");
  });

  it("STALE 结果携带 canonical caseState", async () => {
    const v1 = await seed();
    await changeCaseStatusCommand({
      caseId: v1.id,
      nextStatus: "RESPONDING",
      operationId: "cc-canon-a",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, { status: "RESPONDING" }),
    });
    const stale = await updateBusinessContextCommand({
      caseId: v1.id,
      operationId: "cc-canon-b",
      baseUpdatedAt: v1.updatedAt,
      nextCaseState: toNextState(v1, {
        businessContext: {
          ...v1.caseState.businessContext,
          businessLegitimacy: "UNAUTHORIZED",
        },
      }),
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.case?.status).toBe("RESPONDING");
    expect(stale.case?.updatedAt).toBeTruthy();
    expect(stale.case?.caseState).toBeTruthy();
  });
});
