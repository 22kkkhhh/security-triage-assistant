import { businessContextSemanticPatch, timelineEventSemanticIntent } from "@/test-utils/semanticCommandIntents";
/**
 * v1.3 Step 6：HumanReview Responsibility（Server-owned）。
 */
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { saveCaseStateAction } from "@/app/(app)/cases/actions";
import { updateHumanReviewAction } from "@/app/(app)/cases/commandActions";
import { caseA } from "@/domain/demo";
import type { AuthUser } from "@/domain/auth";
import type { HumanReview } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { userActor, systemActor } from "@/services/audit/auditEventBuilder";
import { buildReportData } from "@/services/reporting/reportBuilder";
import { resetPrismaClient } from "@/lib/prisma";
import {
  addHandoffNoteCommand,
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  createCaseWithAudit,
  createReportDraftCommand,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
} from "@/services/caseCommands";
import { parseHumanReviewSemanticInput } from "@/services/caseCommands/humanReviewSemantic";
import {
  ensureVitestAuthUsersInDb,
  runWithTestAuthUser,
  setVitestDefaultAuthUser,
  VITEST_ANALYST_USER,
} from "@/services/auth/testAuthContext";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import {
  getCaseById,
  saveCaseSnapshot,
} from "@/services/persistence/caseRepository";
import { parseCaseSnapshotPatch } from "@/services/persistence/caseSnapshotPatch";

const TEST_DB_FILE = path.resolve("prisma/test-hr-responsibility.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

const USER_A: AuthUser = {
  ...VITEST_ANALYST_USER,
  id: "hr-resp-user-a",
  username: "hr.resp.a",
  displayName: "分析员甲",
  email: "hr-resp-a@example.test",
};

const USER_B: AuthUser = {
  ...VITEST_ANALYST_USER,
  id: "hr-resp-user-b",
  username: "hr.resp.b",
  displayName: "分析员乙",
  email: "hr-resp-b@example.test",
};

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function upsertUser(u: AuthUser) {
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.upsert({
    where: { id: u.id },
    create: {
      id: u.id,
      name: u.displayName,
      email: u.email,
      emailVerified: false,
      username: u.username,
      displayUsername: u.username,
      role: u.role,
      enabled: u.enabled,
    },
    update: {
      name: u.displayName,
      role: u.role,
      enabled: u.enabled,
    },
  });
}

async function seedCase(operationId: string) {
  const analyzed = analyzeSecurityCase(caseA);
  const created = await createCaseWithAudit(
    {
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    },
    { operationId, actor: systemActor() },
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error);
  return created.case;
}


function responsibilityOf(hr: HumanReview | null | undefined) {
  return {
    reviewer: hr?.reviewer ?? null,
    reviewedByUserId: hr?.reviewedByUserId ?? null,
  };
}

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
  await resetPrismaClient(TEST_DB_URL);
  setVitestDefaultAuthUser(VITEST_ANALYST_USER);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  await ensureVitestAuthUsersInDb();
  await upsertUser(USER_A);
  await upsertUser(USER_B);
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("parseHumanReviewSemanticInput", () => {
  it("仅接受 finalConclusion / humanRiskLevel", () => {
    expect(
      parseHumanReviewSemanticInput({
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
      }),
    ).toEqual({
      finalConclusion: "NORMAL_BUSINESS",
      humanRiskLevel: "LOW",
    });
  });

  it("注入 reviewer / reviewedByUserId / conclusionNote / 未知字段 → reject", () => {
    expect(
      parseHumanReviewSemanticInput({
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        reviewer: "董事长",
      }),
    ).toMatch(/不允许字段/);
    expect(
      parseHumanReviewSemanticInput({
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        reviewedByUserId: "user-admin",
      }),
    ).toMatch(/不允许字段/);
    expect(
      parseHumanReviewSemanticInput({
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        conclusionNote: "偷写说明",
      }),
    ).toMatch(/不允许字段/);
    expect(
      parseHumanReviewSemanticInput({
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        adjustments: [],
      }),
    ).toMatch(/不允许字段/);
  });
});

describe("Snapshot responsibility injection", () => {
  it("reviewer / reviewedByUserId 不在 Snapshot allowlist", () => {
    expect(
      parseCaseSnapshotPatch({ humanReview: { reviewer: "董事长" } }),
    ).toMatch(/不允许字段/);
    expect(
      parseCaseSnapshotPatch({
        humanReview: { reviewedByUserId: "user-admin" },
      }),
    ).toMatch(/不允许字段/);
  });
});

describe("Responsibility updates", () => {
  it("A 改 finalConclusion → responsibility A；B 改 humanRiskLevel → B", async () => {
    const created = await seedCase("hr-resp-ab");
    const a = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
      humanRiskLevel: created.caseState.humanReview?.humanRiskLevel ?? null,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(responsibilityOf(a.case.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
    expect(a.audit?.actorId).toBe(USER_A.id);

    const b = await updateHumanReviewCommand({
      caseId: a.case.id,
      operationId: randomUUID(),
      baseUpdatedAt: a.case.updatedAt,
      actor: userActor(USER_B),
      finalConclusion: a.case.caseState.humanReview!.finalConclusion,
      humanRiskLevel: "HIGH",
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(responsibilityOf(b.case.caseState.humanReview)).toEqual({
      reviewer: "分析员乙",
      reviewedByUserId: USER_B.id,
    });
    const logs = await listCaseAuditLogs({ caseId: created.id, limit: 50 });
    const hrLogs = logs.items.filter(
      (x) => x.actionType === "HUMAN_REVIEW_UPDATED",
    );
    expect(hrLogs).toHaveLength(2);
    expect(hrLogs.map((x) => x.actorId).sort()).toEqual(
      [USER_A.id, USER_B.id].sort(),
    );
  });

  it("NO-OP 不抢责任人；不写 Audit；不抬升 lastActivityAt", async () => {
    const created = await seedCase("hr-resp-noop");
    const a = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const noop = await updateHumanReviewCommand({
      caseId: a.case.id,
      operationId: randomUUID(),
      baseUpdatedAt: a.case.updatedAt,
      actor: userActor(USER_B),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
    });
    expect(noop.ok).toBe(true);
    if (!noop.ok) return;
    expect(noop.alreadyApplied).toBe(true);
    expect(noop.audit).toBeNull();
    expect(noop.case.updatedAt).toBe(a.case.updatedAt);
    expect(noop.case.lastActivityAt).toBe(a.case.lastActivityAt);
    expect(responsibilityOf(noop.case.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
  });

  it("note-only Snapshot 不改责任人、不写 HR Audit、不改 lastActivityAt", async () => {
    const created = await seedCase("hr-resp-note");
    const a = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.alreadyApplied).toBe(false);

    await new Promise((r) => setTimeout(r, 15));
    const note = await saveCaseSnapshot(a.case.id, {
      humanReview: { conclusionNote: "仅乙修改说明" },
      baseUpdatedAt: a.case.updatedAt,
    });
    expect(note.caseState.humanReview?.conclusionNote).toBe("仅乙修改说明");
    expect(responsibilityOf(note.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
    expect(note.lastActivityAt).toBe(a.case.lastActivityAt);
    expect(note.updatedAt).not.toBe(a.case.updatedAt);

    const logs = await listCaseAuditLogs({ caseId: created.id, limit: 50 });
    expect(
      logs.items.filter((x) => x.actionType === "HUMAN_REVIEW_UPDATED"),
    ).toHaveLength(1);
  });

  it("Status / BC / Checklist / Timeline / Handoff 不改责任人", async () => {
    const created = await seedCase("hr-resp-other");
    const a = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
      humanRiskLevel: "HIGH",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    let current = a.case;
    const expected = {
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    };

    const status = await changeCaseStatusCommand({
      caseId: current.id,
      nextStatus: "RESPONDING",
      operationId: randomUUID(),
      baseUpdatedAt: current.updatedAt,

      actor: userActor(USER_B),
    });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    current = status.case;
    expect(responsibilityOf(current.caseState.humanReview)).toEqual(expected);

    const bc = await updateBusinessContextCommand({
      caseId: current.id,
      operationId: randomUUID(),
      baseUpdatedAt: current.updatedAt,
      businessContextPatch: businessContextSemanticPatch({
          ...current.caseState.businessContext,
          businessLegitimacy:
            current.caseState.businessContext.businessLegitimacy ===
            "AUTHORIZED"
              ? "UNAUTHORIZED"
              : "AUTHORIZED",
        }),
      actor: userActor(USER_B),
    });
    expect(bc.ok).toBe(true);
    if (!bc.ok) return;
    current = bc.case;
    expect(responsibilityOf(current.caseState.humanReview)).toEqual(expected);

    const item = current.caseState.checklist.find((x) => !x.completed);
    expect(item).toBeTruthy();
    const cl = await applyChecklistCommand({
      caseId: current.id,
      action: "complete",
      itemId: item!.id,
      operationId: randomUUID(),
      baseUpdatedAt: current.updatedAt,

      actor: userActor(USER_B),
    });
    expect(cl.ok).toBe(true);
    if (!cl.ok) return;
    current = cl.case;
    expect(responsibilityOf(current.caseState.humanReview)).toEqual(expected);

    const eventId = randomUUID();
    const tl = await addTimelineEventCommand({
      caseId: current.id,
      eventId,
      operationId: randomUUID(),
      baseUpdatedAt: current.updatedAt,
      eventIntent: timelineEventSemanticIntent([
          ...current.caseState.timeline,
          {
            id: eventId,
            occurredAt: "2026-08-08T03:00:00.000Z",
            title: "补充",
            description: "",
            operator: null,
            source: "HUMAN",
            eventType: "其他",
          },
        ], eventId),
      actor: userActor(USER_B),
    });
    expect(tl.ok).toBe(true);
    if (!tl.ok) return;
    current = tl.case;
    expect(responsibilityOf(current.caseState.humanReview)).toEqual(expected);

    const handoff = await addHandoffNoteCommand({
      caseId: current.id,
      note: "交接给乙，不转移研判责任",
      operationId: randomUUID(),
      actor: userActor(USER_B),
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    const after = await getCaseById(current.id);
    expect(responsibilityOf(after!.caseState.humanReview)).toEqual(expected);
  });

  it("same-user operationId retry 不重写责任人", async () => {
    const created = await seedCase("hr-resp-retry");
    const opId = randomUUID();
    const first = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: opId,
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: opId,
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "NORMAL_BUSINESS",
      humanRiskLevel: "LOW",
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.alreadyApplied).toBe(true);
    expect(retry.case.updatedAt).toBe(first.case.updatedAt);
    expect(responsibilityOf(retry.case.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
  });

  it("cross-user operationId replay → FORBIDDEN，责任人保持 A", async () => {
    const created = await seedCase("hr-resp-xuser");
    const opId = randomUUID();
    const first = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: opId,
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replay = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: opId,
      baseUpdatedAt: first.case.updatedAt,
      actor: userActor(USER_B),
      finalConclusion: "NORMAL_BUSINESS",
      humanRiskLevel: "LOW",
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("FORBIDDEN");
    const after = await getCaseById(created.id);
    expect(responsibilityOf(after!.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
  });

  it("OCC stale 不改责任人", async () => {
    const created = await seedCase("hr-resp-stale");
    const a = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const stale = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_B),
      finalConclusion: "NORMAL_BUSINESS",
      humanRiskLevel: "LOW",
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("STALE");
    const after = await getCaseById(created.id);
    expect(responsibilityOf(after!.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
  });
});

describe("Legacy HumanReview", () => {
  it("Legacy reviewer + 无 reviewedByUserId 可加载；首轮 semantic 建立认证责任人", async () => {
    const created = await seedCase("hr-legacy");
    expect(created.caseState.humanReview?.reviewer).toBe("王研判");
    expect(created.caseState.humanReview?.reviewedByUserId ?? null).toBeNull();

    const securityCase = analyzeSecurityCase({
      ...caseA,
      humanReview: created.caseState.humanReview,
    });
    const draft = buildReportData({
      securityCase,
      humanReview: created.caseState.humanReview,
      checklist: created.caseState.checklist,
      timeline: created.caseState.timeline,
    });
    expect(draft.basicInfo.some((x) => x.value === "王研判")).toBe(true);

    const beforeUpdatedAt = created.updatedAt;
    const reloaded = await getCaseById(created.id);
    expect(reloaded!.updatedAt).toBe(beforeUpdatedAt);
    expect(reloaded!.caseState.humanReview?.reviewer).toBe("王研判");

    const first = await updateHumanReviewCommand({
      caseId: created.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(USER_B),
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: created.caseState.humanReview?.humanRiskLevel ?? null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(responsibilityOf(first.case.caseState.humanReview)).toEqual({
      reviewer: "分析员乙",
      reviewedByUserId: USER_B.id,
    });
    expect(first.case.caseState.humanReview?.conclusionNote).toBe(
      created.caseState.humanReview?.conclusionNote,
    );
  });

  it("创建 Case 不自动设置研判责任人；existing ReportDraft 不随责任人同步", async () => {
    const analyzed = analyzeSecurityCase({
      ...caseA,
      humanReview: null,
    });
    const created = await createCaseWithAudit(
      {
        draft: { ...caseA, humanReview: null },
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "hr-create-no-resp", actor: userActor(USER_A) },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.case.caseState.humanReview).toBeNull();

    const withHr = await updateHumanReviewCommand({
      caseId: created.case.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.case.updatedAt,
      actor: userActor(USER_A),
      finalConclusion: "NORMAL_BUSINESS",
      humanRiskLevel: "LOW",
    });
    expect(withHr.ok).toBe(true);
    if (!withHr.ok) return;

    const report = await createReportDraftCommand({
      caseId: withHr.case.id,
      operationId: randomUUID(),
      actor: userActor(USER_A),
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const reviewerInDraft = report.case.reportDraft?.basicInfo.find(
      (x) => x.label === "研判人员",
    )?.value;
    expect(reviewerInDraft).toBe("分析员甲");

    const next = await updateHumanReviewCommand({
      caseId: withHr.case.id,
      operationId: randomUUID(),
      baseUpdatedAt: report.case.updatedAt,
      actor: userActor(USER_B),
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
      humanRiskLevel: "HIGH",
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.case.caseState.humanReview?.reviewer).toBe("分析员乙");
    expect(
      next.case.reportDraft?.basicInfo.find((x) => x.label === "研判人员")
        ?.value,
    ).toBe("分析员甲");
  });
});

describe("Action contract + Client spoof", () => {
  it("Action 拒绝伪造 reviewedByUserId；合法写入使用 AuthUser", async () => {
    const created = await seedCase("hr-action-spoof");
    const spoof = await runWithTestAuthUser(USER_B, () =>
      updateHumanReviewAction(
        created.id,
        randomUUID(),
        {
          finalConclusion: "NORMAL_BUSINESS",
          humanRiskLevel: "LOW",
          reviewedByUserId: USER_A.id,
        },
        created.updatedAt,
      ),
    );
    expect(spoof.ok).toBe(false);

    const ok = await runWithTestAuthUser(USER_B, () =>
      updateHumanReviewAction(
        created.id,
        randomUUID(),
        {
          finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
          humanRiskLevel: "HIGH",
        },
        created.updatedAt,
      ),
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.alreadyApplied).toBe(false);
    expect(ok.caseState.humanReview?.reviewedByUserId).toBe(USER_B.id);
    expect(ok.caseState.humanReview?.reviewer).toBe("分析员乙");
  });

  it("note-only Action Snapshot 保持责任人", async () => {
    const created = await seedCase("hr-action-note");
    const a = await runWithTestAuthUser(USER_A, () =>
      updateHumanReviewAction(
        created.id,
        randomUUID(),
        {
          finalConclusion: "INCONCLUSIVE",
          humanRiskLevel: "MEDIUM",
        },
        created.updatedAt,
      ),
    );
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const note = await runWithTestAuthUser(USER_B, () =>
      saveCaseStateAction(created.id, {
        humanReview: { conclusionNote: "乙仅改说明" },
        baseUpdatedAt: a.updatedAt,
      }),
    );
    expect(note.ok).toBe(true);
    if (!note.ok) return;
    const after = await getCaseById(created.id);
    expect(after!.caseState.humanReview?.conclusionNote).toBe("乙仅改说明");
    expect(responsibilityOf(after!.caseState.humanReview)).toEqual({
      reviewer: "分析员甲",
      reviewedByUserId: USER_A.id,
    });
  });
});
