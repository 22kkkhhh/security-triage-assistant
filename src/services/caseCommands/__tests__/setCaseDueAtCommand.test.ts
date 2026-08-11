/**
 * v1.11 M2：due-date command / idempotency / stale / invariants / queue sort。
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
import {
  assignCaseCommand,
  createCaseWithAudit,
  setCaseDueAtCommand,
} from "@/services/caseCommands";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import {
  getCaseById,
  listCases,
  sortCasesByDuePriority,
} from "@/services/persistence/caseRepository";
import type { CaseListItem } from "@/services/persistence/types";
import {
  ensureVitestAuthUsersInDb,
  VITEST_ADMIN_USER,
  VITEST_ANALYST_USER,
} from "@/services/auth/testAuthContext";
import type { AuthUser } from "@/domain/auth";
import { emptyCaseOwnership } from "@/domain/caseOwnership";

const TEST_DB_FILE = path.resolve("prisma/test-case-due-at.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

const ANALYST_B: AuthUser = {
  id: "vitest-analyst-b-due-id",
  username: "vitest-analyst-b-due",
  displayName: "Vitest 分析员乙-Due",
  email: "vitest-analyst-b-due@example.test",
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
    { operationId: `due-create-${randomUUID()}`, actor: systemActor() },
  );
  if (!created.ok) throw new Error(created.error);
  return created.case;
}

async function claimAs(user: AuthUser, caseId: string, baseUpdatedAt: string) {
  const result = await assignCaseCommand({
    caseId,
    targetUserId: user.id,
    operationId: `claim-${randomUUID()}`,
    baseUpdatedAt,
    actor: userActor(user),
    actorRole: user.role,
  });
  if (!result.ok) throw new Error(result.error);
  return result.case;
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
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("setCaseDueAtCommand", () => {
  it("Analyst own：set / update / clear PASS；Audit + lastActivity", async () => {
    const seeded = await seedCase();
    const owned = await claimAs(
      VITEST_ANALYST_USER,
      seeded.id,
      seeded.updatedAt,
    );
    const beforeActivity = owned.lastActivityAt;
    const snapshot = {
      status: owned.status,
      suggested: owned.suggestedRiskLevel,
      human: owned.humanRiskLevel,
      review: owned.caseState.humanReview,
      checklist: owned.caseState.checklist,
      report: owned.reportDraft,
      caseStateJson: JSON.stringify(owned.caseState),
      owner: owned.ownership.assignedToUserId,
    };

    const setIso = "2026-08-11T10:00:00.000Z";
    const setResult = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: setIso,
      operationId: `due-set-${randomUUID()}`,
      baseUpdatedAt: owned.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(setResult.ok).toBe(true);
    if (!setResult.ok) return;
    expect(setResult.case.dueAt).toBe(setIso);
    expect(setResult.audit?.actionType).toBe("CASE_DUE_DATE_CHANGED");
    expect(setResult.case.lastActivityAt >= beforeActivity).toBe(true);

    const updatedIso = "2026-08-12T10:00:00.000Z";
    const updateResult = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: updatedIso,
      operationId: `due-upd-${randomUUID()}`,
      baseUpdatedAt: setResult.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) return;
    expect(updateResult.case.dueAt).toBe(updatedIso);

    const clearResult = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: null,
      operationId: `due-clr-${randomUUID()}`,
      baseUpdatedAt: updateResult.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(clearResult.ok).toBe(true);
    if (!clearResult.ok) return;
    expect(clearResult.case.dueAt).toBeNull();

    // invariants
    expect(clearResult.case.status).toBe(snapshot.status);
    expect(clearResult.case.suggestedRiskLevel).toBe(snapshot.suggested);
    expect(clearResult.case.humanRiskLevel).toBe(snapshot.human);
    expect(clearResult.case.caseState.humanReview).toEqual(snapshot.review);
    expect(clearResult.case.caseState.checklist).toEqual(snapshot.checklist);
    expect(clearResult.case.reportDraft).toEqual(snapshot.report);
    expect(JSON.stringify(clearResult.case.caseState)).toBe(
      snapshot.caseStateJson,
    );
    expect(clearResult.case.ownership.assignedToUserId).toBe(snapshot.owner);
  });

  it("Analyst unassigned / other's：reject", async () => {
    const seeded = await seedCase();
    const unassigned = await setCaseDueAtCommand({
      caseId: seeded.id,
      dueAtIso: "2026-08-11T10:00:00.000Z",
      operationId: `due-un-${randomUUID()}`,
      baseUpdatedAt: seeded.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(unassigned.ok).toBe(false);
    if (!unassigned.ok) expect(unassigned.code).toBe("FORBIDDEN");

    const owned = await claimAs(ANALYST_B, seeded.id, seeded.updatedAt);
    const other = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: "2026-08-11T10:00:00.000Z",
      operationId: `due-oth-${randomUUID()}`,
      baseUpdatedAt: owned.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.code).toBe("FORBIDDEN");
  });

  it("Admin 任意 Case PASS（含未分配）", async () => {
    const seeded = await seedCase();
    const result = await setCaseDueAtCommand({
      caseId: seeded.id,
      dueAtIso: "2026-08-15T02:00:00.000Z",
      operationId: `due-admin-${randomUUID()}`,
      baseUpdatedAt: seeded.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.dueAt).toBe("2026-08-15T02:00:00.000Z");
  });

  it("invalid ISO reject", async () => {
    const seeded = await seedCase();
    const result = await setCaseDueAtCommand({
      caseId: seeded.id,
      dueAtIso: "not-iso",
      operationId: `due-bad-${randomUUID()}`,
      baseUpdatedAt: seeded.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(result.ok).toBe(false);
  });

  it("same operationId → idempotent；same dueAt → semantic no-op", async () => {
    const seeded = await seedCase();
    const owned = await claimAs(
      VITEST_ANALYST_USER,
      seeded.id,
      seeded.updatedAt,
    );
    const opId = `due-idem-${randomUUID()}`;
    const iso = "2026-08-11T10:00:00.000Z";
    const first = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: iso,
      operationId: opId,
      baseUpdatedAt: owned.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replay = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: iso,
      operationId: opId,
      baseUpdatedAt: first.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.alreadyApplied).toBe(true);

    const audits = await listCaseAuditLogs({ caseId: owned.id, limit: 50 });
    const dueAudits = audits.items.filter(
      (a) => a.actionType === "CASE_DUE_DATE_CHANGED",
    );
    expect(dueAudits).toHaveLength(1);

    const noop = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: iso,
      operationId: `due-noop-${randomUUID()}`,
      baseUpdatedAt: first.case.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(noop.ok).toBe(true);
    if (!noop.ok) return;
    expect(noop.alreadyApplied).toBe(true);
    expect(noop.audit).toBeNull();

    const audits2 = await listCaseAuditLogs({ caseId: owned.id, limit: 50 });
    expect(
      audits2.items.filter((a) => a.actionType === "CASE_DUE_DATE_CHANGED"),
    ).toHaveLength(1);
  });

  it("stale baseUpdatedAt；ownership 变更后不可覆盖", async () => {
    const seeded = await seedCase();
    const owned = await claimAs(
      VITEST_ANALYST_USER,
      seeded.id,
      seeded.updatedAt,
    );
    const staleBase = owned.updatedAt;

    const reassigned = await assignCaseCommand({
      caseId: owned.id,
      targetUserId: ANALYST_B.id,
      operationId: `reassign-${randomUUID()}`,
      baseUpdatedAt: owned.updatedAt,
      actor: userActor(VITEST_ADMIN_USER),
      actorRole: "ADMIN",
    });
    expect(reassigned.ok).toBe(true);

    const stale = await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: "2026-08-11T10:00:00.000Z",
      operationId: `due-stale-${randomUUID()}`,
      baseUpdatedAt: staleBase,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("STALE");

    const current = await getCaseById(owned.id);
    expect(current?.dueAt).toBeNull();
    expect(current?.ownership.assignedToUserId).toBe(ANALYST_B.id);
  });
});

describe("listCases sort=due", () => {
  it("default recent unchanged；due 桶序 deterministic", async () => {
    const now = new Date("2026-08-11T04:00:00.000Z");
    const mk = (
      id: string,
      caseNumber: string,
      status: CaseListItem["status"],
      dueAt: string | null,
      lastActivityAt: string,
    ): CaseListItem => ({
      id,
      caseNumber,
      title: id,
      status,
      suggestedRiskLevel: null,
      humanRiskLevel: null,
      humanConclusion: null,
      username: null,
      sourceIp: null,
      systemsSearchText: null,
      pendingChecklistCount: 0,
      hasReport: false,
      reportUpdatedAt: null,
      lastActivityAt,
      ownership: emptyCaseOwnership(),
      dueAt,
      createdAt: lastActivityAt,
      updatedAt: lastActivityAt,
      closedAt: status === "CLOSED" ? lastActivityAt : null,
    });

    const items: CaseListItem[] = [
      mk("c-none", "INC-0005", "NEW", null, "2026-08-11T03:00:00.000Z"),
      mk(
        "c-up",
        "INC-0003",
        "INVESTIGATING",
        "2026-08-14T10:00:00.000Z",
        "2026-08-11T02:00:00.000Z",
      ),
      mk(
        "c-today",
        "INC-0002",
        "INVESTIGATING",
        "2026-08-11T10:00:00.000Z",
        "2026-08-11T01:00:00.000Z",
      ),
      mk(
        "c-over",
        "INC-0001",
        "INVESTIGATING",
        "2026-08-11T01:00:00.000Z",
        "2026-08-11T00:30:00.000Z",
      ),
      mk(
        "c-closed",
        "INC-0004",
        "CLOSED",
        "2026-08-01T00:00:00.000Z",
        "2026-08-11T04:00:00.000Z",
      ),
    ];

    const ordered = sortCasesByDuePriority(items, now).map((c) => c.id);
    expect(ordered).toEqual([
      "c-over",
      "c-today",
      "c-up",
      "c-none",
      "c-closed",
    ]);
  });

  it("mine + due / filters 组合", async () => {
    const a = await seedCase();
    const owned = await claimAs(VITEST_ANALYST_USER, a.id, a.updatedAt);
    await setCaseDueAtCommand({
      caseId: owned.id,
      dueAtIso: "2026-08-11T10:00:00.000Z",
      operationId: `due-q-${randomUUID()}`,
      baseUpdatedAt: owned.updatedAt,
      actor: userActor(VITEST_ANALYST_USER),
      actorRole: "ANALYST",
    });

    const now = new Date("2026-08-11T04:00:00.000Z");
    const mineDue = await listCases({
      scope: "mine",
      trustedCurrentUserId: VITEST_ANALYST_USER.id,
      sort: "due",
      now,
    });
    expect(mineDue.some((c) => c.id === owned.id)).toBe(true);
    expect(mineDue[0]?.dueAt).not.toBeNull();

    const recent = await listCases({ sort: "recent" });
    expect(recent.length).toBeGreaterThan(0);
  });
});
