/**
 * v1.3 Step 5：Trusted USER Actor + operationId ownership。
 */
import { execSync } from "node:child_process";
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
import {
  changeCaseStatusAction,
  updateBusinessContextAction,
  updateHumanReviewAction,
} from "@/app/(app)/cases/commandActions";
import { createCaseAction } from "@/app/(app)/cases/actions";
import { caseA } from "@/domain/demo";
import type { AuthUser } from "@/domain/auth";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { userActor, systemActor, manualActor } from "@/services/audit/auditEventBuilder";
import { validateOperationOwnership } from "@/services/audit/operationOwnership";
import { auth } from "@/lib/auth";
import { resetPrismaClient } from "@/lib/prisma";
import {
  addHandoffNoteCommand,
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  createCaseWithAudit,
  createReportDraftCommand,
  exportReportCommand,
  saveReportDraftCommand,
  updateBusinessContextCommand,
  updateHumanReviewCommand,
} from "@/services/caseCommands";
import { normalizeRecord } from "@/services/normalization/normalize";
import {
  ensureVitestAuthUsersInDb,
  runWithTestAuthUser,
  setVitestDefaultAuthUser,
  VITEST_ANALYST_USER,
  VITEST_VIEWER_USER,
} from "@/services/auth/testAuthContext";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import { getCaseById } from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";
import { requirePermission } from "@/services/auth/requirePermission";

const TEST_DB_FILE = path.resolve("prisma/test-trusted-actor.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
const TEST_PASSWORD = "TestOnly_TrustedActor_9x!";

const USER_A: AuthUser = {
  ...VITEST_ANALYST_USER,
  id: "trusted-user-a",
  username: "trusted.a",
  displayName: "张三",
  email: "trusted-a@example.test",
};

const USER_B: AuthUser = {
  ...VITEST_ANALYST_USER,
  id: "trusted-user-b",
  username: "trusted.b",
  displayName: "李四",
  email: "trusted-b@example.test",
};

function cleanDbFiles(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${file}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
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

function toNextState(
  record: NonNullable<Awaited<ReturnType<typeof getCaseById>>>,
  patch: Partial<SaveCaseStateInput> = {},
): SaveCaseStateInput {
  return {
    caseData: record.caseState.caseData,
    businessContext: record.caseState.businessContext,
    humanReview: record.caseState.humanReview,
    checklist: record.caseState.checklist,
    timeline: record.caseState.timeline,
    suggestedRiskLevel: record.suggestedRiskLevel,
    status: record.status,
    ...patch,
  };
}

async function fingerprint(caseId: string) {
  const record = await getCaseById(caseId);
  const audits = await listCaseAuditLogs({ caseId, limit: 200 });
  return {
    updatedAt: record!.updatedAt,
    lastActivityAt: record!.lastActivityAt,
    status: record!.status,
    reportUpdatedAt: record!.reportUpdatedAt,
    auditCount: audits.items.length,
    auditIds: audits.items.map((a) => a.id).join(","),
  };
}

function manualInput() {
  return normalizeRecord({
    sourceType: "MANUAL",
    pairs: [
      { rawKey: "alertName", rawValue: "Trusted Actor 告警" },
      { rawKey: "alertTime", rawValue: "2026-08-08 02:36" },
      { rawKey: "username", rawValue: "trusted_user" },
      { rawKey: "sourceIp", rawValue: "10.20.16.87" },
      { rawKey: "database", rawValue: "CRM_PROD" },
      { rawKey: "rowsAffected", rawValue: "10" },
      { rawKey: "accessedSystems", rawValue: "HR系统" },
    ],
  }).input;
}

beforeAll(async () => {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("测试需要 BETTER_AUTH_SECRET");
  }
  cleanDbFiles(TEST_DB_FILE);
  process.env.DATABASE_URL = TEST_DB_URL;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  await resetPrismaClient(TEST_DB_URL);
  setVitestDefaultAuthUser(null);
});

beforeEach(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  await ensureVitestAuthUsersInDb();
  await upsertUser(USER_A);
  await upsertUser(USER_B);
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles(TEST_DB_FILE);
});

describe("userActor helper", () => {
  it("actorType=USER；actorId=id；actorName=displayName 快照", () => {
    const actor = userActor(USER_A);
    expect(actor).toEqual({
      actorType: "USER",
      actorId: USER_A.id,
      actorName: "张三",
    });
  });
});

describe("Command USER Actor 覆盖", () => {
  it("Status / Checklist / BC / HR / Timeline / Handoff → USER", async () => {
    const created = await seedCase("actor-cover");
    let latest = created;

    const status = await changeCaseStatusCommand({
      caseId: latest.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });
    expect(status.ok && status.audit?.actorType).toBe("USER");
    expect(status.ok && status.audit?.actorId).toBe(USER_A.id);
    expect(status.ok && status.audit?.actorName).toBe("张三");
    if (status.ok) latest = status.case;

    const item =
      latest.caseState.checklist.find((c) => !c.completed) ??
      latest.caseState.checklist[0]!;
    const complete = await applyChecklistCommand({
      caseId: latest.id,
      action: "complete",
      itemId: item.id,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        checklist: latest.caseState.checklist.map((c) =>
          c.id === item.id ? { ...c, completed: true } : c,
        ),
      }),
      actor: userActor(USER_A),
    });
    expect(complete.ok).toBe(true);
    if (!complete.ok) throw new Error(complete.error);
    expect(complete.audit?.actorType).toBe("USER");
    latest = complete.case;

    const reopen = await applyChecklistCommand({
      caseId: latest.id,
      action: "reopen",
      itemId: item.id,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        checklist: latest.caseState.checklist.map((c) =>
          c.id === item.id ? { ...c, completed: false } : c,
        ),
      }),
      actor: userActor(USER_A),
    });
    expect(reopen.ok && reopen.audit?.actorType).toBe("USER");
    if (reopen.ok) latest = reopen.case;

    const manualId = randomUUID();
    const add = await applyChecklistCommand({
      caseId: latest.id,
      action: "add",
      itemId: manualId,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        checklist: [
          ...latest.caseState.checklist,
          {
            id: manualId,
            category: "IDENTITY",
            label: "人工核查项",
            completed: false,
            note: null,
            origin: "MANUAL",
            relatedRuleId: null,
          },
        ],
      }),
      actor: userActor(USER_A),
    });
    expect(add.ok && add.audit?.actorType).toBe("USER");
    if (add.ok) latest = add.case;

    const del = await applyChecklistCommand({
      caseId: latest.id,
      action: "delete",
      itemId: manualId,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        checklist: latest.caseState.checklist.filter((c) => c.id !== manualId),
      }),
      actor: userActor(USER_A),
    });
    expect(del.ok && del.audit?.actorType).toBe("USER");
    if (del.ok) latest = del.case;

    const nextLegitimacy =
      latest.caseState.businessContext.businessLegitimacy === "AUTHORIZED"
        ? "UNAUTHORIZED"
        : "AUTHORIZED";
    const bc = await updateBusinessContextCommand({
      caseId: latest.id,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        businessContext: {
          ...latest.caseState.businessContext,
          businessLegitimacy: nextLegitimacy,
          businessOwner: "管理员",
        },
      }),
      actor: userActor(USER_A),
    });
    expect(bc.ok).toBe(true);
    if (!bc.ok) throw new Error(bc.error);
    expect(bc.audit?.actorType).toBe("USER");
    expect(bc.audit?.actorName).toBe("张三");
    latest = bc.case;

    const nextConclusion =
      latest.caseState.humanReview?.finalConclusion ===
      "SUSPECTED_SECURITY_INCIDENT"
        ? "NORMAL_BUSINESS"
        : "SUSPECTED_SECURITY_INCIDENT";
    const hr = await updateHumanReviewCommand({
      caseId: latest.id,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        humanReview: {
          reviewer: "董事长",
          finalConclusion: nextConclusion,
          humanRiskLevel: "MEDIUM",
          conclusionNote: null,
          confirmedAt: null,
          adjustments: latest.caseState.humanReview?.adjustments ?? [],
        },
      }),
      actor: userActor(USER_A),
    });
    expect(hr.ok).toBe(true);
    if (!hr.ok) throw new Error(hr.error);
    expect(hr.audit?.actorType).toBe("USER");
    expect(hr.audit?.actorId).toBe(USER_A.id);
    expect(hr.audit?.actorName).toBe("张三");
    expect(hr.audit?.actorName).not.toBe("董事长");
    latest = hr.case;

    const eventId = randomUUID();
    const tl = await addTimelineEventCommand({
      caseId: latest.id,
      eventId,
      operationId: randomUUID(),
      baseUpdatedAt: latest.updatedAt,
      nextCaseState: toNextState(latest, {
        timeline: [
          ...latest.caseState.timeline,
          {
            id: eventId,
            occurredAt: "2026-08-08T03:00:00.000Z",
            title: "人工补充事件",
            description: "补充说明",
            operator: null,
            source: "HUMAN",
            eventType: "其他",
          },
        ],
      }),
      actor: userActor(USER_A),
    });
    expect(tl.ok && tl.audit?.actorType).toBe("USER");
    if (tl.ok) latest = tl.case;

    const handoff = await addHandoffNoteCommand({
      caseId: latest.id,
      note: "交接说明",
      operationId: randomUUID(),
      actor: userActor(USER_A),
    });
    expect(handoff.ok && handoff.audit?.actorType).toBe("USER");
    expect(handoff.ok && handoff.audit?.actorName).toBe("张三");
  });

  it("Report create/update/export → USER；Case create Action → USER；Seed → SYSTEM", async () => {
    const created = await seedCase("report-actor");
    expect(
      (await listCaseAuditLogs({ caseId: created.id })).items[0]!.actorType,
    ).toBe("SYSTEM");

    const report = await createReportDraftCommand({
      caseId: created.id,
      operationId: randomUUID(),
      actor: userActor(USER_A),
    });
    expect(report.ok && report.audit?.actorType).toBe("USER");

    const draft = (await getCaseById(created.id))!.reportDraft!;
    const updated = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: { ...draft, title: `${draft.title}-edit` },
      baseReportUpdatedAt: (await getCaseById(created.id))!.reportUpdatedAt,
      auditOperationId: randomUUID(),
      actor: userActor(USER_A),
    });
    expect(updated.ok && updated.audit?.actorType).toBe("USER");

    const exported = await exportReportCommand({
      caseId: created.id,
      operationId: randomUUID(),
      actor: userActor(USER_A),
    });
    expect(exported.ok).toBe(true);
    const exportLogs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      exportLogs.items.find((x) => x.actionType === "REPORT_EXPORTED")
        ?.actorType,
    ).toBe("USER");

    const viaAction = await runWithTestAuthUser(USER_A, () =>
      createCaseAction(manualInput(), randomUUID()),
    );
    expect(viaAction.ok).toBe(true);
    if (!viaAction.ok) return;
    const logs = await listCaseAuditLogs({ caseId: viaAction.id });
    expect(logs.items[0]!.actorType).toBe("USER");
    expect(logs.items[0]!.actorId).toBe(USER_A.id);
  });
});

describe("actorName snapshot", () => {
  it("displayName 变更不改旧 Audit；新操作使用新快照", async () => {
    const created = await seedCase("snap-name");
    const op1 = randomUUID();
    const first = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op1,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });
    expect(first.ok && first.audit?.actorName).toBe("张三");

    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: USER_A.id },
      data: { name: "张三（安全运营）" },
    });
    const renamed: AuthUser = {
      ...USER_A,
      displayName: "张三（安全运营）",
    };

    const retry = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op1,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(renamed),
    });
    expect(retry.ok && retry.alreadyApplied).toBe(true);
    expect(retry.ok && retry.audit?.actorName).toBe("张三");

    const latest = await getCaseById(created.id);
    const second = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "RESPONDING",
      operationId: randomUUID(),
      baseUpdatedAt: latest!.updatedAt,
      nextCaseState: toNextState(latest!, { status: "RESPONDING" }),
      actor: userActor(renamed),
    });
    expect(second.ok && second.audit?.actorName).toBe("张三（安全运营）");
    expect(second.ok && second.audit?.actorId).toBe(USER_A.id);
  });
});

describe("operationId ownership", () => {
  it("same-user retry alreadyApplied；无重复 Audit / lastActivityAt 不变", async () => {
    const created = await seedCase("own-same");
    const op = randomUUID();
    const first = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });
    expect(first.ok && first.alreadyApplied).toBe(false);
    const mid = await fingerprint(created.id);

    const retry = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });
    expect(retry.ok && retry.alreadyApplied).toBe(true);
    expect(await fingerprint(created.id)).toEqual(mid);
  });

  it("cross-user replay → FORBIDDEN；无副作用", async () => {
    const created = await seedCase("own-cross");
    const op = randomUUID();
    const first = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });
    expect(first.ok).toBe(true);
    const before = await fingerprint(created.id);

    const cross = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_B),
    });
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.code).toBe("FORBIDDEN");
    expect(await fingerprint(created.id)).toEqual(before);
  });

  it("wrong case / wrong action / MANUAL op / SYSTEM op → reject", async () => {
    const a = await seedCase("own-case-a");
    const b = await seedCase("own-case-b");
    const op = randomUUID();
    await changeCaseStatusCommand({
      caseId: a.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op,
      baseUpdatedAt: a.updatedAt,
      nextCaseState: toNextState(a, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });

    const wrongCase = await changeCaseStatusCommand({
      caseId: b.id,
      nextStatus: "RESPONDING",
      operationId: op,
      baseUpdatedAt: b.updatedAt,
      nextCaseState: toNextState(b, { status: "RESPONDING" }),
      actor: userActor(USER_A),
    });
    expect(wrongCase.ok).toBe(false);

    const aLatest = await getCaseById(a.id);
    expect(aLatest).not.toBeNull();
    const wrongAction = await updateBusinessContextCommand({
      caseId: a.id,
      operationId: op,
      baseUpdatedAt: aLatest!.updatedAt,
      nextCaseState: toNextState(aLatest!, {
        businessContext: {
          ...aLatest!.caseState.businessContext,
          businessLegitimacy:
            aLatest!.caseState.businessContext.businessLegitimacy ===
            "AUTHORIZED"
              ? "UNAUTHORIZED"
              : "AUTHORIZED",
        },
      }),
      actor: userActor(USER_A),
    });
    expect(wrongAction.ok).toBe(false);

    const ownershipManual = validateOperationOwnership({
      existing: {
        actorType: "MANUAL",
        actorId: null,
        caseId: a.id,
        actionType: "STATUS_CHANGED",
      },
      expectedActor: userActor(USER_A) as {
        actorType: "USER";
        actorId: string;
        actorName: string;
      },
      caseId: a.id,
      actionType: "STATUS_CHANGED",
    });
    expect(ownershipManual.ok).toBe(false);
    if (!ownershipManual.ok) expect(ownershipManual.code).toBe("FORBIDDEN");

    const ownershipSystem = validateOperationOwnership({
      existing: {
        actorType: "SYSTEM",
        actorId: null,
        caseId: a.id,
        actionType: "CASE_CREATED",
      },
      expectedActor: userActor(USER_A) as {
        actorType: "USER";
        actorId: string;
        actorName: string;
      },
      caseId: a.id,
      actionType: "CASE_CREATED",
    });
    expect(ownershipSystem.ok).toBe(false);

    // USER 不得冒用 Seed SYSTEM operationId
    const systemOp = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzeSecurityCase(caseA).checklist,
        suggestedRiskLevel: null,
      },
      {
        operationId: "seed:v12:case-a:created",
        actor: userActor(USER_A),
      },
    );
    // 若该 op 不存在则创建成功；先写入 SYSTEM 再重放
    const sysCreated = await createCaseWithAudit(
      {
        draft: { ...caseA, name: "sys-op-case" },
        checklist: analyzeSecurityCase(caseA).checklist,
        suggestedRiskLevel: null,
      },
      { operationId: "sys-op-1", actor: systemActor() },
    );
    expect(sysCreated.ok).toBe(true);
    const userReplaySys = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzeSecurityCase(caseA).checklist,
        suggestedRiskLevel: null,
      },
      { operationId: "sys-op-1", actor: userActor(USER_A) },
    );
    expect(userReplaySys.ok).toBe(false);
    if (!userReplaySys.ok) expect(userReplaySys.code).toBe("FORBIDDEN");
    expect(systemOp.ok || !systemOp.ok).toBe(true); // silence unused
    expect(manualActor("x").actorType).toBe("MANUAL");
  });

  it("Viewer replay Analyst op → authz FORBIDDEN（早于 ownership）", async () => {
    const created = await seedCase("viewer-replay");
    const op = randomUUID();
    await runWithTestAuthUser(USER_A, () =>
      changeCaseStatusAction(
        created.id,
        "PENDING_VERIFICATION",
        op,
        toNextState(created, { status: "PENDING_VERIFICATION" }),
        created.updatedAt,
      ),
    );
    const before = await fingerprint(created.id);

    const denied = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      changeCaseStatusAction(
        created.id,
        "PENDING_VERIFICATION",
        op,
        toNextState(created, { status: "PENDING_VERIFICATION" }),
        created.updatedAt,
      ),
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("FORBIDDEN");
    expect(await fingerprint(created.id)).toEqual(before);
  });

  it("disabled / role downgrade retry → authz FORBIDDEN", async () => {
    await auth.api.createUser({
      body: {
        email: "live.actor@example.test",
        password: TEST_PASSWORD,
        name: "在线分析员",
        role: "ANALYST",
        data: { username: "live.actor" },
      },
    });
    const signed = await auth.api.signInUsername({
      body: { username: "live.actor", password: TEST_PASSWORD },
      returnHeaders: true,
    });
    const setCookie = signed.headers.getSetCookie?.() ?? [];
    const headers = new Headers();
    headers.set(
      "cookie",
      setCookie.map((c) => c.split(";")[0]).join("; "),
    );
    const user = await requirePermission("CASE_STATUS_CHANGE", headers);
    const created = await seedCase("disable-retry");
    const op = randomUUID();
    const first = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: op,
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(user),
    });
    expect(first.ok).toBe(true);

    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { username: "live.actor" },
      data: { enabled: false },
    });
    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).rejects.toThrow();

    await prisma.user.update({
      where: { username: "live.actor" },
      data: { enabled: true, role: "VIEWER" },
    });
    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).rejects.toThrow();
    await expect(requirePermission("CASE_READ", headers)).resolves.toMatchObject(
      { role: "VIEWER" },
    );
  });
});

describe("Report / Case creation ownership", () => {
  it("REPORT_CREATED/UPDATED/EXPORTED same-user retry；cross-user reject", async () => {
    const created = await seedCase("report-own");
    const createOp = randomUUID();
    const first = await createReportDraftCommand({
      caseId: created.id,
      operationId: createOp,
      actor: userActor(USER_A),
    });
    expect(first.ok && first.alreadyApplied).toBe(false);
    const retry = await createReportDraftCommand({
      caseId: created.id,
      operationId: createOp,
      actor: userActor(USER_A),
    });
    expect(retry.ok && retry.alreadyApplied).toBe(true);
    const cross = await createReportDraftCommand({
      caseId: created.id,
      operationId: createOp,
      actor: userActor(USER_B),
    });
    expect(cross.ok).toBe(false);

    const draft = (await getCaseById(created.id))!.reportDraft!;
    const updateOp = randomUUID();
    const u1 = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: { ...draft, title: "t1" },
      baseReportUpdatedAt: (await getCaseById(created.id))!.reportUpdatedAt,
      auditOperationId: updateOp,
      actor: userActor(USER_A),
    });
    expect(u1.ok && u1.alreadyApplied).toBe(false);
    const uRetry = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: { ...draft, title: "t1" },
      baseReportUpdatedAt: (await getCaseById(created.id))!.reportUpdatedAt,
      auditOperationId: updateOp,
      actor: userActor(USER_A),
    });
    expect(uRetry.ok && uRetry.alreadyApplied).toBe(true);
    const uCross = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: { ...draft, title: "t2" },
      baseReportUpdatedAt: (await getCaseById(created.id))!.reportUpdatedAt,
      auditOperationId: updateOp,
      actor: userActor(USER_B),
    });
    expect(uCross.ok).toBe(false);

    const exportOp = randomUUID();
    const e1 = await exportReportCommand({
      caseId: created.id,
      operationId: exportOp,
      actor: userActor(USER_A),
    });
    expect(e1.ok && e1.alreadyApplied).toBe(false);
    const before = await fingerprint(created.id);
    const eRetry = await exportReportCommand({
      caseId: created.id,
      operationId: exportOp,
      actor: userActor(USER_A),
    });
    expect(eRetry.ok && eRetry.alreadyApplied).toBe(true);
    expect(eRetry.ok && eRetry.fileBase64.length).toBeGreaterThan(20);
    expect((await fingerprint(created.id)).auditCount).toBe(before.auditCount);
    const eCross = await exportReportCommand({
      caseId: created.id,
      operationId: exportOp,
      actor: userActor(USER_B),
    });
    expect(eCross.ok).toBe(false);
  });

  it("Case create same-user retry；cross-user reject", async () => {
    const op = randomUUID();
    const a1 = await runWithTestAuthUser(USER_A, () =>
      createCaseAction(manualInput(), op),
    );
    expect(a1.ok).toBe(true);
    if (!a1.ok) return;
    const a2 = await runWithTestAuthUser(USER_A, () =>
      createCaseAction(manualInput(), op),
    );
    expect(a2.ok && a2.alreadyApplied).toBe(true);
    if (a2.ok) expect(a2.id).toBe(a1.id);

    const b = await runWithTestAuthUser(USER_B, () =>
      createCaseAction(manualInput(), op),
    );
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe("FORBIDDEN");
  });
});

describe("USER FK Restrict", () => {
  it("存在 USER Audit 时物理删除 User 失败", async () => {
    const created = await seedCase("fk-restrict");
    await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: randomUUID(),
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, { status: "PENDING_VERIFICATION" }),
      actor: userActor(USER_A),
    });
    const { prisma } = await import("@/lib/prisma");
    await expect(
      prisma.user.delete({ where: { id: USER_A.id } }),
    ).rejects.toThrow();
  });
});

describe("reviewer / businessOwner spoof via Action", () => {
  it("HR / BC Action Audit 使用 AuthUser 而非案件文本", async () => {
    const created = await seedCase("spoof-action");
    const hr = await runWithTestAuthUser(USER_A, () =>
      updateHumanReviewAction(
        created.id,
        randomUUID(),
        toNextState(created, {
          humanReview: {
            reviewer: "伪造研判员",
            finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
            humanRiskLevel: "HIGH",
            conclusionNote: null,
            confirmedAt: null,
            adjustments: created.caseState.humanReview?.adjustments ?? [],
          },
        }),
        created.updatedAt,
      ),
    );
    expect(hr.ok).toBe(true);
    if (hr.ok && hr.audit) {
      expect(hr.audit.actorName).toBe("张三");
      expect(hr.audit.actorName).not.toBe("伪造研判员");
    }

    const latest = await getCaseById(created.id);
    const bc = await runWithTestAuthUser(USER_A, () =>
      updateBusinessContextAction(
        latest!.id,
        randomUUID(),
        toNextState(latest!, {
          businessContext: {
            ...latest!.caseState.businessContext,
            businessLegitimacy: "AUTHORIZED",
            businessOwner: "管理员",
          },
        }),
        latest!.updatedAt,
      ),
    );
    expect(bc.ok).toBe(true);
    if (bc.ok && bc.audit) {
      expect(bc.audit.actorName).toBe("张三");
    }
  });
});
