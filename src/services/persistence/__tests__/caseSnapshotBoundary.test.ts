/**
 * v1.3 Step 0：Snapshot Autosave 写边界攻击回归 + 语义/审计回归。
 */
import { execSync } from "node:child_process";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  applyChecklistCommand,
  changeCaseStatusCommand,
  createCaseWithAudit,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
  addTimelineEventCommand,
  addHandoffNoteCommand,
} from "@/services/caseCommands";
import { saveCaseStateAction } from "@/app/(app)/cases/actions";
import { resetPrismaClient } from "@/lib/prisma";
import {
  ensureVitestAuthUsersInDb,
  setVitestDefaultAuthUser,
  VITEST_ANALYST_USER,
} from "@/services/auth/testAuthContext";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import {
  getCaseById,
  saveCaseSnapshot,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";
import {
  parseCaseSnapshotPatch,
} from "@/services/persistence/caseSnapshotPatch";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-case-snapshot-boundary.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

async function seedCase(
  draft: typeof caseA,
  operationId: string,
) {
  const analyzed = analyzeSecurityCase(draft);
  const created = await createCaseWithAudit(
    {
      draft,
      checklist: analyzed.checklist,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    },
    { operationId, actor: systemActor()
},
  );
  expect(created.ok).toBe(true);
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
  setVitestDefaultAuthUser(VITEST_ANALYST_USER);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  await ensureVitestAuthUsersInDb();
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("parseCaseSnapshotPatch allowlist", () => {
  it("注入 status / timeline / caseData / suggestedRiskLevel / checklist → reject", () => {
    expect(parseCaseSnapshotPatch({ status: "CLOSED" })).toMatch(/不允许字段/);
    expect(parseCaseSnapshotPatch({ timeline: [] })).toMatch(/不允许字段/);
    expect(parseCaseSnapshotPatch({ caseData: {} })).toMatch(/不允许字段/);
    expect(
      parseCaseSnapshotPatch({ suggestedRiskLevel: "LOW" }),
    ).toMatch(/不允许字段/);
    expect(parseCaseSnapshotPatch({ checklist: [] })).toMatch(/不允许字段/);
  });

  it("注入 structured BusinessContext / finalConclusion / humanRiskLevel → reject", () => {
    expect(
      parseCaseSnapshotPatch({
        businessContext: { businessLegitimacy: "AUTHORIZED" },
      }),
    ).toMatch(/不允许字段/);
    expect(
      parseCaseSnapshotPatch({
        humanReview: { finalConclusion: "NORMAL_BUSINESS" },
      }),
    ).toMatch(/不允许字段/);
    expect(
      parseCaseSnapshotPatch({
        humanReview: { humanRiskLevel: "LOW" },
      }),
    ).toMatch(/不允许字段/);
  });

  it("未知 root / nested key → reject；重复 checklistId → reject", () => {
    expect(parseCaseSnapshotPatch({ foo: 1 })).toMatch(/不允许字段/);
    expect(
      parseCaseSnapshotPatch({
        businessContext: { businessJustification: "x", evil: 1 },
      }),
    ).toMatch(/不允许字段/);
    expect(
      parseCaseSnapshotPatch({
        checklistNotes: [
          { checklistId: "a", note: "1" },
          { checklistId: "a", note: "2" },
        ],
      }),
    ).toMatch(/重复/);
  });

  it("合法 allowlist 字段可解析", () => {
    const parsed = parseCaseSnapshotPatch({
      businessContext: {
        businessJustification: "说明",
        changeTicketId: "CHG-1",
        businessOwner: "张三（Mock）",
      },
      humanReview: {
        conclusionNote: "备注",
        reviewer: "李研判（Mock）",
      },
      checklistNotes: [{ checklistId: "c1", note: "核查备注" }],
      baseUpdatedAt: "2026-08-09T00:00:00.000Z",
    });
    expect(typeof parsed).not.toBe("string");
  });
});

describe("saveCaseSnapshot / saveCaseStateAction 写边界", () => {
  it("合法 businessJustification / changeTicketId / businessOwner patch → success", async () => {
    const created = await seedCase(caseA, "snap-bc-text");
    await sleep(15);
    const saved = await saveCaseSnapshot(created.id, {
      businessContext: {
        businessJustification: "Snapshot 业务说明",
        changeTicketId: "CHG-SNAP-1",
        businessOwner: "业务负责人（Mock）",
      },
      baseUpdatedAt: created.updatedAt,
    });
    expect(saved.caseState.businessContext.businessJustification).toBe(
      "Snapshot 业务说明",
    );
    expect(saved.caseState.businessContext.changeTicketId).toBe("CHG-SNAP-1");
    expect(saved.caseState.businessContext.businessOwner).toBe(
      "业务负责人（Mock）",
    );
    expect(saved.caseState.businessContext.businessLegitimacy).toBe(
      created.caseState.businessContext.businessLegitimacy,
    );
    expect(saved.lastActivityAt).toBe(created.lastActivityAt);
  });

  it("合法 conclusionNote patch → success；不改 finalConclusion", async () => {
    const created = await seedCase(caseA, "snap-hr-note");
    const beforeConclusion = created.caseState.humanReview?.finalConclusion;
    await sleep(15);
    const saved = await saveCaseSnapshot(created.id, {
      humanReview: { conclusionNote: "Snapshot 研判说明" },
      baseUpdatedAt: created.updatedAt,
    });
    expect(saved.caseState.humanReview?.conclusionNote).toBe(
      "Snapshot 研判说明",
    );
    expect(saved.caseState.humanReview?.finalConclusion).toBe(beforeConclusion);
  });

  it("Checklist note patch 只改 note", async () => {
    const created = await seedCase(caseA, "snap-cl-note");
    const item = created.caseState.checklist[0];
    expect(item).toBeTruthy();
    const before = { ...item! };
    await sleep(15);
    const saved = await saveCaseSnapshot(created.id, {
      checklistNotes: [{ checklistId: before.id, note: "仅备注" }],
      baseUpdatedAt: created.updatedAt,
    });
    const after = saved.caseState.checklist.find((x) => x.id === before.id)!;
    expect(after.note).toBe("仅备注");
    expect(after.completed).toBe(before.completed);
    expect(after.origin).toBe(before.origin);
    expect(after.label).toBe(before.label);
    expect(saved.caseState.checklist).toHaveLength(
      created.caseState.checklist.length,
    );
  });

  it("注入 Semantic-owned / 完整集合字段 → action reject，状态不变", async () => {
    const created = await seedCase(caseA, "snap-attack");
    const attacks = [
      { status: "CLOSED" },
      {
        businessContext: { businessLegitimacy: "AUTHORIZED" },
      },
      { humanReview: { finalConclusion: "NORMAL_BUSINESS" } },
      { humanReview: { humanRiskLevel: "LOW" } },
      { checklist: [{ id: "x", completed: true }] },
      { timeline: [] },
      { caseData: created.caseState.caseData },
      { suggestedRiskLevel: "LOW" },
      { unknownRoot: true },
      {
        businessContext: {
          businessJustification: "ok",
          plannedTaskStatus: "EXISTS",
        },
      },
    ];

    for (const payload of attacks) {
      const result = await saveCaseStateAction(created.id, {
        ...payload,
        baseUpdatedAt: created.updatedAt,
      });
      expect(result.ok).toBe(false);
    }

    const latest = await getCaseById(created.id);
    expect(latest!.status).toBe(created.status);
    expect(latest!.caseState.businessContext.businessLegitimacy).toBe(
      created.caseState.businessContext.businessLegitimacy,
    );
    expect(latest!.caseState.humanReview?.finalConclusion).toBe(
      created.caseState.humanReview?.finalConclusion,
    );
    expect(latest!.suggestedRiskLevel).toBe(created.suggestedRiskLevel);
    expect(latest!.caseState.checklist).toHaveLength(
      created.caseState.checklist.length,
    );
    expect(latest!.updatedAt).toBe(created.updatedAt);
  });

  it("尝试通过 checklistNotes 改 completed / 增删 item → reject 或不生效", async () => {
    const created = await seedCase(caseA, "snap-cl-semantic");
    const rejectCompleted = parseCaseSnapshotPatch({
      checklistNotes: [
        {
          checklistId: created.caseState.checklist[0]!.id,
          note: "x",
          completed: true,
        },
      ],
    });
    expect(rejectCompleted).toMatch(/不允许字段/);

    const rejectFullChecklist = await saveCaseStateAction(created.id, {
      checklist: [
        ...created.caseState.checklist,
        {
          id: "manual-inject",
          category: "IDENTITY",
          label: "注入项",
          completed: false,
          note: null,
          origin: "MANUAL",
          relatedRuleId: null,
        },
      ],
      baseUpdatedAt: created.updatedAt,
    });
    expect(rejectFullChecklist.ok).toBe(false);
    expect((await getCaseById(created.id))!.caseState.checklist).toHaveLength(
      created.caseState.checklist.length,
    );
  });

  it("不存在 checklist id → reject", async () => {
    const created = await seedCase(caseA, "snap-missing-cl");
    await expect(
      saveCaseSnapshot(created.id, {
        checklistNotes: [{ checklistId: "does-not-exist", note: "x" }],
        baseUpdatedAt: created.updatedAt,
      }),
    ).rejects.toThrow(/不存在/);
  });

  it("stale baseUpdatedAt → StaleCaseStateError；无 Audit；lastActivityAt 不变", async () => {
    const created = await seedCase(caseA, "snap-stale");
    const status = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "snap-stale-status",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }), actor: systemActor()
});
    expect(status.ok).toBe(true);
    if (!status.ok) return;

    const logsBefore = await listCaseAuditLogs({ caseId: created.id });
    const activityBefore = status.case.lastActivityAt;

    await expect(
      saveCaseSnapshot(created.id, {
        businessContext: { businessJustification: "旧 patch" },
        baseUpdatedAt: created.updatedAt,
      }),
    ).rejects.toBeInstanceOf(StaleCaseStateError);

    const actionResult = await saveCaseStateAction(created.id, {
      businessContext: { businessJustification: "旧 patch via action" },
      baseUpdatedAt: created.updatedAt,
    });
    expect(actionResult.ok).toBe(false);
    if (!actionResult.ok) {
      expect(actionResult.code).toBe("STALE");
    }

    const logsAfter = await listCaseAuditLogs({ caseId: created.id });
    expect(logsAfter.items).toHaveLength(logsBefore.items.length);
    const latest = await getCaseById(created.id);
    expect(latest!.lastActivityAt).toBe(activityBefore);
    expect(latest!.status).toBe("PENDING_VERIFICATION");
    expect(latest!.caseState.businessContext.businessJustification).not.toBe(
      "旧 patch",
    );
  });

  it("合法 Snapshot 不产生 Semantic Audit；audit count 不变", async () => {
    const created = await seedCase(caseA, "snap-no-audit");
    const before = await listCaseAuditLogs({ caseId: created.id });
    await sleep(15);
    await saveCaseSnapshot(created.id, {
      businessContext: { businessJustification: "无审计备注" },
      humanReview: { conclusionNote: "无审计说明" },
      baseUpdatedAt: created.updatedAt,
    });
    const after = await listCaseAuditLogs({ caseId: created.id });
    expect(after.items).toHaveLength(before.items.length);
    const semanticTypes = new Set([
      "STATUS_CHANGED",
      "BUSINESS_CONTEXT_UPDATED",
      "HUMAN_REVIEW_UPDATED",
      "CHECKLIST_COMPLETED",
      "CHECKLIST_REOPENED",
      "CHECKLIST_ADDED",
      "CHECKLIST_DELETED",
      "TIMELINE_EVENT_ADDED",
    ]);
    const beforeSemantic = before.items.filter((x) =>
      semanticTypes.has(x.actionType),
    ).length;
    const afterSemantic = after.items.filter((x) =>
      semanticTypes.has(x.actionType),
    ).length;
    expect(afterSemantic).toBe(beforeSemantic);
  });

  it("empty patch → NO-OP：updatedAt / lastActivityAt / Audit 不变", async () => {
    const created = await seedCase(caseA, "snap-empty");
    const logsBefore = await listCaseAuditLogs({ caseId: created.id });
    await sleep(15);
    const saved = await saveCaseSnapshot(created.id, {
      baseUpdatedAt: created.updatedAt,
    });
    expect(saved.updatedAt).toBe(created.updatedAt);
    expect(saved.lastActivityAt).toBe(created.lastActivityAt);
    const logsAfter = await listCaseAuditLogs({ caseId: created.id });
    expect(logsAfter.items).toHaveLength(logsBefore.items.length);

    const sameValue = await saveCaseSnapshot(created.id, {
      businessContext: {
        businessJustification:
          created.caseState.businessContext.businessJustification,
      },
      baseUpdatedAt: created.updatedAt,
    });
    expect(sameValue.updatedAt).toBe(created.updatedAt);
  });
});

describe("Semantic Commands 仍正常且产生 Audit", () => {
  it("Status / BusinessContext / HumanReview / Checklist / Timeline / Handoff", async () => {
    const created = await seedCase(caseA, "snap-semantic-reg");
    let current = created;

    const status = await changeCaseStatusCommand({
      caseId: current.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "sem-status",
      baseUpdatedAt: current.updatedAt,
      nextCaseState: toNextState(current, { status: "PENDING_VERIFICATION" }), actor: systemActor()
});
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.audit?.actionType).toBe("STATUS_CHANGED");
    current = status.case;

    const nextBc = {
      ...current.caseState.businessContext,
      businessLegitimacy: "UNAUTHORIZED" as const,
    };
    const bc = await updateBusinessContextCommand({
      caseId: current.id,
      operationId: "sem-bc",
      baseUpdatedAt: current.updatedAt,
      nextCaseState: toNextState(current, { businessContext: nextBc }), actor: systemActor()
});
    expect(bc.ok).toBe(true);
    if (!bc.ok) return;
    expect(bc.audit?.actionType).toBe("BUSINESS_CONTEXT_UPDATED");
    current = bc.case;

    const hr = {
      reviewer: "研判员（Mock）",
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT" as const,
      humanRiskLevel: "HIGH" as const,
      conclusionNote: "建议进一步核查",
      adjustments: [],
      confirmedAt: new Date().toISOString(),
    };
    const human = await updateHumanReviewCommand({
      caseId: current.id,
      operationId: "sem-hr",
      baseUpdatedAt: current.updatedAt,
      nextCaseState: toNextState(current, { humanReview: hr }), actor: systemActor()
});
    expect(human.ok).toBe(true);
    if (!human.ok) return;
    expect(human.audit?.actionType).toBe("HUMAN_REVIEW_UPDATED");
    current = human.case;

    const item = current.caseState.checklist.find((x) => !x.completed);
    expect(item).toBeTruthy();
    const checklist = await applyChecklistCommand({
      caseId: current.id,
      action: "complete",
      itemId: item!.id,
      operationId: "sem-cl",
      baseUpdatedAt: current.updatedAt,
      nextCaseState: toNextState(current, {
        checklist: current.caseState.checklist.map((x) =>
          x.id === item!.id ? { ...x, completed: true } : x,
        ),
      }), actor: systemActor()
});
    expect(checklist.ok).toBe(true);
    if (!checklist.ok) return;
    expect(checklist.audit?.actionType).toMatch(/CHECKLIST/);
    current = checklist.case;

    const event = {
      id: "tl-snap-reg-1",
      occurredAt: "2026-08-08T12:00:00.000Z",
      eventType: "其他",
      title: "已通知业务方",
      description: "电话确认",
      operator: "研判员（Mock）",
      source: "HUMAN" as const,
    };
    const timeline = await addTimelineEventCommand({
      caseId: current.id,
      eventId: event.id,
      operationId: "sem-tl",
      baseUpdatedAt: current.updatedAt,
      nextCaseState: toNextState(current, {
        timeline: [...current.caseState.timeline, event],
      }), actor: systemActor()
});
    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;
    expect(timeline.audit?.actionType).toBe("TIMELINE_EVENT_ADDED");
    current = timeline.case;

    const handoff = await addHandoffNoteCommand({
      caseId: current.id,
      note: "交接给夜班（Mock）",
      operationId: "sem-handoff", actor: systemActor()
});
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.audit?.actionType).toBe("HANDOFF_NOTE_ADDED");
  });
});

describe("Demo Case A / Case B 不变量", () => {
  it("Case A NORMAL_BUSINESS；Case B 疑似；UNKNOWN ≠ LOW", async () => {
    expect(caseA.humanReview?.finalConclusion).toBe("NORMAL_BUSINESS");
    expect(caseB.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
    const a = await seedCase(caseA, "snap-case-a");
    const b = await seedCase(caseB, "snap-case-b");
    expect(a.caseState.humanReview?.finalConclusion).toBe("NORMAL_BUSINESS");
    expect(b.caseState.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
    const analyzedB = analyzeSecurityCase(caseB);
    for (const r of analyzedB.analysisResults) {
      if (r.status === "UNKNOWN") {
        expect(r.riskLevel).toBeNull();
      }
    }
  });
});
