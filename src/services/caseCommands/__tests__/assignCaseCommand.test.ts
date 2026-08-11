/**
 * v1.11 M1：Case Ownership command / persistence / concurrency / invariants。
 */
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { systemActor, userActor } from "@/services/audit/auditEventBuilder";
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
import { caseA } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { assignCaseCommand, createCaseWithAudit } from "@/services/caseCommands";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import { getCaseById, listCases } from "@/services/persistence/caseRepository";
import {
  ensureVitestAuthUsersInDb,
  VITEST_ADMIN_USER,
  VITEST_ANALYST_USER,
  VITEST_VIEWER_USER,
} from "@/services/auth/testAuthContext";
import type { AuthUser } from "@/domain/auth";

const TEST_DB_FILE = path.resolve("prisma/test-case-ownership.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

const ANALYST_B: AuthUser = {
  id: "vitest-analyst-b-id",
  username: "vitest-analyst-b",
  displayName: "Vitest 分析员乙",
  email: "vitest-analyst-b@example.test",
  role: "ANALYST",
  enabled: true,
};

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function ensureUsers() {
  await ensureVitestAuthUsersInDb();
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.upsert({
    where: { id: ANALYST_B.id },
    create: {
      id: ANALYST_B.id,
      name: ANALYST_B.displayName,
      email: ANALYST_B.email,
      emailVerified: false,
      username: ANALYST_B.username,
      displayUsername: ANALYST_B.username,
      role: ANALYST_B.role,
      enabled: ANALYST_B.enabled,
    },
    update: {
      name: ANALYST_B.displayName,
      role: ANALYST_B.role,
      enabled: ANALYST_B.enabled,
    },
  });
}

async function seedCase() {
  const analyzed = analyzeSecurityCase(caseA);
  const created = await createCaseWithAudit(
    {
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    },
    { operationId: `own-create-${randomUUID()}`, actor: systemActor() },
  );
  if (!created.ok) throw new Error(created.error);
  return created.case;
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
  await ensureUsers();
});

afterAll(async () => {
  await resetPrismaClient();
  cleanDbFiles();
});

describe("assignCaseCommand — Analyst / Admin / target", () => {
  it("migration 后历史 Case 为未分配", async () => {
    const created = await seedCase();
    expect(created.ownership.assignedToUserId).toBeNull();
    expect(created.ownership.assignedAt).toBeNull();
    const reloaded = await getCaseById(created.id);
    expect(reloaded?.ownership.assignedToUserId).toBeNull();
  });

  it("Analyst claim unassigned self → success；assignedAt set；Audit；lastActivityAt advances", async () => {
    const created = await seedCase();
    const beforeActivity = created.lastActivityAt;
    await new Promise((r) => setTimeout(r, 5));

    const result = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyApplied).toBe(false);
    expect(result.case.ownership.assignedToUserId).toBe(VITEST_ANALYST_USER.id);
    expect(result.case.ownership.assignedAt).toBeTruthy();
    expect(result.audit?.actionType).toBe("CASE_ASSIGNED");
    expect(result.case.lastActivityAt >= beforeActivity).toBe(true);

    const reloaded = await getCaseById(created.id);
    expect(reloaded?.ownership.assignee?.displayName).toBe(
      VITEST_ANALYST_USER.displayName,
    );
  });

  it("Analyst release own → unassign；assignedAt null", async () => {
    const created = await seedCase();
    const claimed = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;

    const released = await assignCaseCommand({
      caseId: created.id,
      targetUserId: null,
      operationId: randomUUID(),
      baseUpdatedAt: claimed.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.case.ownership.assignedToUserId).toBeNull();
    expect(released.case.ownership.assignedAt).toBeNull();
    expect(released.audit?.actionType).toBe("CASE_UNASSIGNED");
  });

  it("Analyst 不能指派他人 / 抢走 / 释放他人", async () => {
    const created = await seedCase();
    const assignOther = await assignCaseCommand({
      caseId: created.id,
      targetUserId: ANALYST_B.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(assignOther.ok).toBe(false);
    if (!assignOther.ok) expect(assignOther.code).toBe("FORBIDDEN");

    const adminAssigned = await assignCaseCommand({
      caseId: created.id,
      targetUserId: ANALYST_B.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(adminAssigned.ok).toBe(true);
    if (!adminAssigned.ok) return;

    const steal = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: adminAssigned.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(steal.ok).toBe(false);
    if (!steal.ok) expect(steal.code).toBe("FORBIDDEN");

    const unassignOther = await assignCaseCommand({
      caseId: created.id,
      targetUserId: null,
      operationId: randomUUID(),
      baseUpdatedAt: adminAssigned.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(unassignOther.ok).toBe(false);
    if (!unassignOther.ok) expect(unassignOther.code).toBe("FORBIDDEN");
  });

  it("Admin assign / reassign / unassign", async () => {
    const created = await seedCase();
    const assigned = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;

    const reassigned = await assignCaseCommand({
      caseId: created.id,
      targetUserId: ANALYST_B.id,
      operationId: randomUUID(),
      baseUpdatedAt: assigned.case.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(reassigned.ok).toBe(true);
    if (!reassigned.ok) return;
    expect(reassigned.case.ownership.assignedToUserId).toBe(ANALYST_B.id);
    expect(reassigned.audit?.actionType).toBe("CASE_ASSIGNED");

    const unassigned = await assignCaseCommand({
      caseId: created.id,
      targetUserId: null,
      operationId: randomUUID(),
      baseUpdatedAt: reassigned.case.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(unassigned.ok).toBe(true);
    if (!unassigned.ok) return;
    expect(unassigned.case.ownership.assignedToUserId).toBeNull();
  });

  it("target VIEWER / disabled / unknown reject；eligible success", async () => {
    const created = await seedCase();
    const viewer = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_VIEWER_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(viewer.ok).toBe(false);

    const unknown = await assignCaseCommand({
      caseId: created.id,
      targetUserId: "no-such-user",
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(unknown.ok).toBe(false);

    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: ANALYST_B.id },
      data: { enabled: false },
    });
    const disabled = await assignCaseCommand({
      caseId: created.id,
      targetUserId: ANALYST_B.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(disabled.ok).toBe(false);

    const adminSelf = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ADMIN_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(adminSelf.ok).toBe(true);
  });
});

describe("assignCaseCommand — concurrency / idempotency / invariants", () => {
  it("same operationId → idempotent；same owner → semantic no-op", async () => {
    const created = await seedCase();
    const opId = randomUUID();
    const first = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: opId,
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replay = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: opId,
      baseUpdatedAt: first.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.alreadyApplied).toBe(true);

    const noop = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: first.case.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(noop.ok).toBe(true);
    if (!noop.ok) return;
    expect(noop.alreadyApplied).toBe(true);
    expect(noop.audit).toBeNull();

    const audits = await listCaseAuditLogs({ caseId: created.id, limit: 50 });
    const assigns = audits.items.filter((a) => a.actionType === "CASE_ASSIGNED");
    expect(assigns).toHaveLength(1);
  });

  it("concurrent claim：第二人不能静默抢走（STALE 或 FORBIDDEN）", async () => {
    const created = await seedCase();
    const base = created.updatedAt;

    const [a, b] = await Promise.all([
      assignCaseCommand({
        caseId: created.id,
        targetUserId: VITEST_ANALYST_USER.id,
        operationId: randomUUID(),
        baseUpdatedAt: base,
        actor: userActor(VITEST_ANALYST_USER),
        actorRole: "ANALYST",
      }),
      assignCaseCommand({
        caseId: created.id,
        targetUserId: ANALYST_B.id,
        operationId: randomUUID(),
        baseUpdatedAt: base,
        actor: userActor(ANALYST_B),
        actorRole: "ANALYST",
      }),
    ]);

    const outcomes = [a, b];
    const successes = outcomes.filter((r) => r.ok);
    const failures = outcomes.filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0]!.ok) {
      expect(["STALE", "FORBIDDEN"]).toContain(failures[0]!.code);
    }

    const reloaded = await getCaseById(created.id);
    expect(reloaded?.ownership.assignedToUserId).toBeTruthy();
    expect(
      [VITEST_ANALYST_USER.id, ANALYST_B.id].includes(
        reloaded!.ownership.assignedToUserId!,
      ),
    ).toBe(true);
  });

  it("assignment 不改 Status / HumanReview / Checklist / reportDraft", async () => {
    const created = await seedCase();
    const before = {
      status: created.status,
      suggested: created.suggestedRiskLevel,
      human: created.humanRiskLevel,
      hr: created.caseState.humanReview,
      checklist: created.caseState.checklist,
      report: created.reportDraft,
    };

    const result = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(before.status);
    expect(result.case.suggestedRiskLevel).toBe(before.suggested);
    expect(result.case.humanRiskLevel).toBe(before.human);
    expect(result.case.caseState.humanReview).toEqual(before.hr);
    expect(result.case.caseState.checklist).toEqual(before.checklist);
    expect(result.case.reportDraft).toEqual(before.report);
  });

  it("listCases scope mine / unassigned / all 可与 filter 组合", async () => {
    const a = await seedCase();
    const bAnalyzed = analyzeSecurityCase({
      ...caseA,
      name: "CRM 二次案件",
      identityContext: {
        ...caseA.identityContext,
        accountName: "crm_user",
      },
    });
    const b = await createCaseWithAudit(
      {
        draft: {
          ...caseA,
          name: "CRM 二次案件",
          identityContext: {
            ...caseA.identityContext,
            accountName: "crm_user",
          },
        },
        checklist: bAnalyzed.checklist,
        suggestedRiskLevel:
          bAnalyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
        status: "INVESTIGATING",
      },
      { operationId: `own-b-${randomUUID()}`, actor: systemActor() },
    );
    if (!b.ok) throw new Error(b.error);

    await assignCaseCommand({
      caseId: a.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: a.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });

    const all = await listCases({ scope: "all" });
    expect(all.length).toBeGreaterThanOrEqual(2);

    const mine = await listCases({
      scope: "mine",
      trustedCurrentUserId: VITEST_ANALYST_USER.id,
    });
    expect(mine.every((c) => c.ownership.assignedToUserId === VITEST_ANALYST_USER.id)).toBe(
      true,
    );
    expect(mine.some((c) => c.id === a.id)).toBe(true);

    const unassigned = await listCases({ scope: "unassigned" });
    expect(unassigned.every((c) => c.ownership.assignedToUserId == null)).toBe(
      true,
    );
    expect(unassigned.some((c) => c.id === b.case.id)).toBe(true);

    const composed = await listCases({
      scope: "mine",
      trustedCurrentUserId: VITEST_ANALYST_USER.id,
      status: "INVESTIGATING",
      search: a.caseNumber.slice(0, 8),
    });
    expect(composed.some((c) => c.id === a.id)).toBe(true);
  });

  it("Analyst 不能 claim 已指派给 disabled user 的 Case", async () => {
    const created = await seedCase();
    const assigned = await assignCaseCommand({
      caseId: created.id,
      targetUserId: ANALYST_B.id,
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;

    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: ANALYST_B.id },
      data: { enabled: false },
    });

    const claim = await assignCaseCommand({
      caseId: created.id,
      targetUserId: VITEST_ANALYST_USER.id,
      operationId: randomUUID(),
      baseUpdatedAt: assigned.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(claim.ok).toBe(false);
    if (!claim.ok) expect(claim.code).toBe("FORBIDDEN");

    const reloaded = await getCaseById(created.id);
    expect(reloaded?.ownership.assignedToUserId).toBe(ANALYST_B.id);
    expect(reloaded?.ownership.assignee?.enabled).toBe(false);
  });
});
