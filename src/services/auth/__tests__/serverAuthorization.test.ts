/**
 * v1.3 Step 4：Server Authorization 边界、无副作用、三角色矩阵、回归。
 */
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { systemActor } from "@/services/audit/auditEventBuilder";
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
  createCaseAction,
  saveCaseStateAction,
} from "@/app/(app)/cases/actions";
import {
  addHandoffNoteAction,
  addTimelineEventAction,
  applyChecklistCommandAction,
  changeCaseStatusAction,
  loadMoreCaseAuditLogsAction,
  updateBusinessContextAction,
  updateHumanReviewAction,
} from "@/app/(app)/cases/commandActions";
import {
  createReportDraftAction,
  exportReportAction,
  saveReportDraftAction,
} from "@/app/(app)/cases/reportActions";
import {
  adminResetPasswordAction,
  createUserAction,
  listUsersAction,
} from "@/app/(app)/admin/users/actions";
import { changeOwnPasswordAction } from "@/app/(app)/account/actions";
import { caseA } from "@/domain/demo";
import {
  ForbiddenError,
  PERMISSIONS,
  UnauthenticatedError,
  type AuthUser,
  type Permission,
} from "@/domain/auth";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { auth } from "@/lib/auth";
import { resetPrismaClient } from "@/lib/prisma";
import {
  createCaseWithAudit,
  createReportDraftCommand,
} from "@/services/caseCommands";
import { normalizeRecord } from "@/services/normalization/normalize";
import {
  requirePermission,
  SERVER_ACTION_PERMISSIONS,
  SERVER_PAGE_PERMISSIONS,
} from "@/services/auth/requirePermission";
import {
  ensureVitestAuthUsersInDb,
  runAsUnauthenticatedTest,
  runWithTestAuthUser,
  setVitestDefaultAuthUser,
  VITEST_ADMIN_USER,
  VITEST_ANALYST_USER,
  VITEST_VIEWER_USER,
} from "@/services/auth/testAuthContext";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import {
  getCaseById,
  listCases,
} from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-server-authorization.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
const TEST_PASSWORD = "TestOnly_ServerAuthz_9x!";

function cleanDbFiles(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${file}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
    { operationId, actor: systemActor()
},
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
  expect(record).not.toBeNull();
  const audits = await listCaseAuditLogs({ caseId, limit: 200 });
  return {
    updatedAt: record!.updatedAt,
    lastActivityAt: record!.lastActivityAt,
    status: record!.status,
    reportUpdatedAt: record!.reportUpdatedAt,
    hasReport: record!.hasReport,
    caseState: JSON.stringify(record!.caseState),
    auditCount: audits.items.length,
    auditIds: audits.items.map((a) => a.id).join(","),
  };
}

function manualInput() {
  return normalizeRecord({
    sourceType: "MANUAL",
    pairs: [
      { rawKey: "alertName", rawValue: "授权测试告警" },
      { rawKey: "alertTime", rawValue: "2026-08-08 02:36" },
      { rawKey: "username", rawValue: "authz_user_01" },
      { rawKey: "sourceIp", rawValue: "10.20.16.87" },
      { rawKey: "database", rawValue: "CRM_PROD" },
      { rawKey: "rowsAffected", rawValue: "100" },
      { rawKey: "accessedSystems", rawValue: "HR系统" },
    ],
  }).input;
}

async function signInHeaders(username: string, password = TEST_PASSWORD) {
  const result = await auth.api.signInUsername({
    body: { username, password },
    returnHeaders: true,
  });
  const setCookie = result.headers.getSetCookie?.() ?? [];
  const headers = new Headers();
  if (setCookie.length > 0) {
    headers.set(
      "cookie",
      setCookie.map((c) => c.split(";")[0]).join("; "),
    );
  } else {
    const raw = result.headers.get("set-cookie");
    if (raw) {
      headers.set(
        "cookie",
        raw
          .split(/,(?=[^;]+?=)/)
          .map((c) => c.split(";")[0]!.trim())
          .join("; "),
      );
    }
  }
  return headers;
}

beforeAll(async () => {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("测试需要 BETTER_AUTH_SECRET");
  }
  cleanDbFiles(TEST_DB_FILE);
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
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
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles(TEST_DB_FILE);
});

describe("Action → Permission 合同", () => {
  it("每个 Server Action 均登记 Permission，且权限在 SoT 中", () => {
    const entries = Object.entries(SERVER_ACTION_PERMISSIONS);
    expect(entries.length).toBeGreaterThanOrEqual(12);
    for (const [, permission] of entries) {
      expect(PERMISSIONS).toContain(permission);
    }
    expect(SERVER_PAGE_PERMISSIONS["/cases/new"]).toBe("CASE_CREATE");
    expect(SERVER_PAGE_PERMISSIONS["/cases/[id]/report"]).toBe("REPORT_READ");
    expect(SERVER_PAGE_PERMISSIONS["/admin/users"]).toBe("USER_ADMIN");
    expect(SERVER_PAGE_PERMISSIONS["/account"]).toBe("PASSWORD_SELF_CHANGE");
    expect(SERVER_ACTION_PERMISSIONS.createUserAction).toBe("USER_ADMIN");
    expect(SERVER_ACTION_PERMISSIONS.adminResetPasswordAction).toBe(
      "PASSWORD_ADMIN_RESET",
    );
    expect(SERVER_ACTION_PERMISSIONS.changeOwnPasswordAction).toBe(
      "PASSWORD_SELF_CHANGE",
    );
  });
});

describe("Viewer 写拒绝 + 无副作用", () => {
  it.each([
    [
      "CASE_CREATE",
      async () => createCaseAction(manualInput(), randomUUID()),
    ],
    [
      "CASE_SNAPSHOT_WRITE",
      async (caseId: string, updatedAt: string) =>
        saveCaseStateAction(caseId, {
          businessContext: { businessJustification: "viewer inject" },
          baseUpdatedAt: updatedAt,
        }),
    ],
    [
      "CASE_STATUS_CHANGE",
      async (caseId: string, updatedAt: string) =>
        changeCaseStatusAction(caseId, "CLOSED", randomUUID(), updatedAt),
    ],
    [
      "CHECKLIST_WRITE",
      async (caseId: string, updatedAt: string, state: SaveCaseStateInput) => {
        const item = state.checklist[0]!;
        return applyChecklistCommandAction(
          caseId,
          "COMPLETE",
          item.id,
          randomUUID(),
          updatedAt,
        );
      },
    ],
    [
      "BUSINESS_CONTEXT_WRITE",
      async (caseId: string, updatedAt: string, state: SaveCaseStateInput) =>
        updateBusinessContextAction(caseId, randomUUID(), updatedAt, {
          plannedTaskStatus: state.businessContext.plannedTaskStatus,
          changeTicketStatus: state.businessContext.changeTicketStatus,
          ownerVerification: state.businessContext.ownerVerification,
          businessLegitimacy: "AUTHORIZED",
        }),
    ],
    [
      "HUMAN_REVIEW_WRITE",
      async (caseId: string, updatedAt: string) =>
        updateHumanReviewAction(
          caseId,
          randomUUID(),
          {
            finalConclusion: "NORMAL_BUSINESS",
            humanRiskLevel: "LOW",
          },
          updatedAt,
        ),
    ],
    [
      "TIMELINE_WRITE",
      async (caseId: string, updatedAt: string) => {
        const eventId = randomUUID();
        return addTimelineEventAction(
          caseId,
          eventId,
          randomUUID(),
          updatedAt,
          {
            id: eventId,
            occurredAt: "2026-08-08T03:00:00.000Z",
            eventType: "其他",
            title: "viewer event",
            description: "",
            operator: null,
          },
        );
      },
    ],
    [
      "HANDOFF_WRITE",
      async (caseId: string) =>
        addHandoffNoteAction(caseId, "viewer handoff", randomUUID()),
    ],
    [
      "REPORT_WRITE create",
      async (caseId: string) =>
        createReportDraftAction(caseId, randomUUID()),
    ],
    [
      "REPORT_WRITE edit",
      async (caseId: string) => {
        const record = await getCaseById(caseId);
        return saveReportDraftAction(caseId, {
          ...(record!.reportDraft ?? {
            title: "t",
            caseNumber: record!.caseNumber,
            sections: [],
            basicInfo: [],
            evidenceIds: [],
            timelineEventIds: [],
          }),
          title: "viewer edited",
        });
      },
    ],
    [
      "REPORT_EXPORT",
      async (caseId: string) => exportReportAction(caseId, randomUUID(), true),
    ],
  ] as const)(
    "%s → FORBIDDEN，状态/Audit 不变",
    async (_label, invoke) => {
      const created = await seedCase(`viewer-deny-${randomUUID()}`);
      await createReportDraftCommand({
        caseId: created.id,
        operationId: `viewer-report-${randomUUID()}`, actor: systemActor()
});
      const before = await fingerprint(created.id);
      const casesBefore = (await listCases({})).length;

      const result = await runWithTestAuthUser(VITEST_VIEWER_USER, async () => {
        const record = await getCaseById(created.id);
        return invoke(
          created.id,
          record!.updatedAt,
          toNextState(record!),
        );
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("FORBIDDEN");
        expect(result.error).toBe("当前账号无权限执行此操作");
      }
      expect(await fingerprint(created.id)).toEqual(before);
      expect((await listCases({})).length).toBe(casesBefore);
    },
  );

  it("VIEWER 非法写 payload 优先 FORBIDDEN，不暴露 validation", async () => {
    const result = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      changeCaseStatusAction("", "NOT_A_STATUS", "", "not-a-date"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.error).not.toMatch(/无效|STALE|状态/);
    }
  });
});

describe("Viewer 读允许", () => {
  it("CASE_READ / ACTIVITY_READ / REPORT_READ 相关入口成功", async () => {
    const created = await seedCase("viewer-read");
    await createReportDraftCommand({
      caseId: created.id,
      operationId: "viewer-read-report", actor: systemActor()
});

    await runWithTestAuthUser(VITEST_VIEWER_USER, async () => {
      await expect(requirePermission("CASE_READ")).resolves.toMatchObject({
        role: "VIEWER",
      });
      await expect(requirePermission("ACTIVITY_READ")).resolves.toMatchObject({
        role: "VIEWER",
      });
      await expect(requirePermission("REPORT_READ")).resolves.toMatchObject({
        role: "VIEWER",
      });
      const activity = await loadMoreCaseAuditLogsAction(created.id, null, 10);
      expect(activity.ok).toBe(true);
    });
  });
});

describe("Analyst / Admin 写允许", () => {
  it("ANALYST Status / Snapshot / Report export 允许", async () => {
    const created = await seedCase("analyst-allow");
    await createReportDraftCommand({
      caseId: created.id,
      operationId: "analyst-report", actor: systemActor()
});

    await runWithTestAuthUser(VITEST_ANALYST_USER, async () => {
      const snap = await saveCaseStateAction(created.id, {
        businessContext: { businessJustification: "analyst note" },
        baseUpdatedAt: (await getCaseById(created.id))!.updatedAt,
      });
      expect(snap.ok).toBe(true);

      const latest = await getCaseById(created.id);
      const status = await changeCaseStatusAction(
        created.id,
        "PENDING_VERIFICATION",
        randomUUID(),
        latest!.updatedAt,
      );
      expect(status.ok).toBe(true);

      const exported = await exportReportAction(
        created.id,
        randomUUID(),
        true,
      );
      expect(exported.ok).toBe(true);
      if (exported.ok) {
        expect(exported.fileBase64.length).toBeGreaterThan(20);
      }
    });
  });

  it("ADMIN 全部 Case/Report Action 允许", async () => {
    const created = await seedCase("admin-allow");
    await runWithTestAuthUser(VITEST_ADMIN_USER, async () => {
      const createdCase = await createCaseAction(manualInput(), randomUUID());
      expect(createdCase.ok).toBe(true);

      const latest = await getCaseById(created.id);
      const handoff = await addHandoffNoteAction(
        created.id,
        "admin handoff",
        randomUUID(),
      );
      expect(handoff.ok).toBe(true);

      const report = await createReportDraftAction(created.id, randomUUID());
      expect(report.ok).toBe(true);

      const exported = await exportReportAction(created.id, randomUUID(), true);
      expect(exported.ok).toBe(true);

      // silence unused
      expect(latest).not.toBeNull();
    });
  });
});

describe("Unauthenticated / Disabled / Role freshness", () => {
  it("无 Session 直接调用写 Action → UNAUTHENTICATED，无副作用", async () => {
    const created = await seedCase("unauth-write");
    const before = await fingerprint(created.id);

    const result = await runAsUnauthenticatedTest(() =>
      changeCaseStatusAction(
        created.id,
        "CLOSED",
        randomUUID(),
        created.updatedAt,
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHENTICATED");
    }
    expect(await fingerprint(created.id)).toEqual(before);
  });

  it("disabled ANALYST → FORBIDDEN（早于 operationId/OCC）", async () => {
    const created = await seedCase("disabled-write");
    const before = await fingerprint(created.id);
    const disabled: AuthUser = { ...VITEST_ANALYST_USER, enabled: false };

    const result = await runWithTestAuthUser(disabled, () =>
      changeCaseStatusAction(
        created.id,
        "CLOSED",
        randomUUID(),
        created.updatedAt,
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
    expect(await fingerprint(created.id)).toEqual(before);
  });

  it("登录 ANALYST 后 DB 改为 VIEWER → requirePermission FORBIDDEN（DB reload）", async () => {
    await auth.api.createUser({
      body: {
        email: "fresh@example.test",
        password: TEST_PASSWORD,
        name: "角色刷新",
        role: "ANALYST",
        data: { username: "fresh.analyst" },
      },
    });
    const headers = await signInHeaders("fresh.analyst");
    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).resolves.toMatchObject({ role: "ANALYST" });

    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { username: "fresh.analyst" },
      data: { role: "VIEWER" },
    });

    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requirePermission("CASE_READ", headers)).resolves.toMatchObject(
      { role: "VIEWER" },
    );
  });

  it("disabled DB user → requirePermission FORBIDDEN", async () => {
    await auth.api.createUser({
      body: {
        email: "off@example.test",
        password: TEST_PASSWORD,
        name: "停用",
        role: "ANALYST",
        data: { username: "off.analyst" },
      },
    });
    const headers = await signInHeaders("off.analyst");
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { username: "off.analyst" },
      data: { enabled: false },
    });
    await expect(
      requirePermission("CASE_READ", headers),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("无 Session → UnauthenticatedError", async () => {
    await expect(requirePermission("CASE_READ", new Headers())).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});

describe("Snapshot allowlist / OCC / operationId 回归", () => {
  it("ANALYST 有 SNAPSHOT_WRITE 仍不能经 Snapshot 改 status", async () => {
    const created = await seedCase("snap-authz");
    const before = await fingerprint(created.id);
    const result = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      saveCaseStateAction(created.id, {
        status: "CLOSED",
        baseUpdatedAt: created.updatedAt,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).not.toBe("FORBIDDEN");
    expect(await fingerprint(created.id)).toEqual(before);
  });

  it("ANALYST 双旧版本：A 成功 B STALE", async () => {
    const created = await seedCase("occ-authz");
    const base = created.updatedAt;

    const a = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      changeCaseStatusAction(
        created.id,
        "PENDING_VERIFICATION",
        randomUUID(),
        base,
      ),
    );
    expect(a.ok).toBe(true);

    const b = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      changeCaseStatusAction(created.id, "RESPONDING", randomUUID(), base),
    );
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe("STALE");
  });

  it("同一 ANALYST 相同 operationId retry → alreadyApplied，不重复 Audit", async () => {
    const created = await seedCase("opid-authz");
    const opId = randomUUID();

    const first = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      changeCaseStatusAction(
        created.id,
        "PENDING_VERIFICATION",
        opId,
        created.updatedAt,
      ),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadyApplied).toBe(false);

    await sleep(20);
    const mid = await fingerprint(created.id);

    const retry = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      changeCaseStatusAction(
        created.id,
        "PENDING_VERIFICATION",
        opId,
        created.updatedAt,
      ),
    );
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.alreadyApplied).toBe(true);
    expect(await fingerprint(created.id)).toEqual(mid);
  });
});

describe("Permission 入口覆盖", () => {
  it("SERVER_ACTION_PERMISSIONS 中每个权限至少有一条真实 Action 拒绝路径（VIEWER）", async () => {
    const created = await seedCase("map-coverage");
    await createReportDraftCommand({
      caseId: created.id,
      operationId: "map-report", actor: systemActor()
});
    const latest = await getCaseById(created.id);
    const state = toNextState(latest!);

    const probes: Record<Permission, () => Promise<{ ok: boolean; code?: string }>> = {
      CASE_CREATE: () => createCaseAction(manualInput(), randomUUID()),
      CASE_SNAPSHOT_WRITE: () =>
        saveCaseStateAction(created.id, {
          businessContext: { businessJustification: "x" },
          baseUpdatedAt: latest!.updatedAt,
        }),
      CASE_STATUS_CHANGE: () =>
        changeCaseStatusAction(
          created.id,
          "CLOSED",
          randomUUID(),
          latest!.updatedAt,
        ),
      CHECKLIST_WRITE: () =>
        applyChecklistCommandAction(
          created.id,
          "COMPLETE",
          state.checklist[0]!.id,
          randomUUID(),
          latest!.updatedAt,
        ),
      BUSINESS_CONTEXT_WRITE: () =>
        updateBusinessContextAction(
          created.id,
          randomUUID(),
          latest!.updatedAt,
          {
            plannedTaskStatus: state.businessContext.plannedTaskStatus,
            changeTicketStatus: state.businessContext.changeTicketStatus,
            ownerVerification: state.businessContext.ownerVerification,
            businessLegitimacy: "AUTHORIZED",
          },
        ),
      HUMAN_REVIEW_WRITE: () =>
        updateHumanReviewAction(
          created.id,
          randomUUID(),
          {
            finalConclusion: "NORMAL_BUSINESS",
            humanRiskLevel: "LOW",
          },
          latest!.updatedAt,
        ),
      TIMELINE_WRITE: () => {
        const eventId = randomUUID();
        return addTimelineEventAction(
          created.id,
          eventId,
          randomUUID(),
          latest!.updatedAt,
          {
            id: eventId,
            occurredAt: "2026-08-08T04:00:00.000Z",
            eventType: "其他",
            title: "probe",
            description: "",
            operator: null,
          },
        );
      },
      HANDOFF_WRITE: () =>
        addHandoffNoteAction(created.id, "x", randomUUID()),
      ACTIVITY_READ: async () => {
        // VIEWER 拥有 ACTIVITY_READ：此处验证 ANALYST→VIEWER 反例用 disabled 不适用
        // 改用无权限角色模拟：临时用 enabled VIEWER 对 USER_ADMIN 不适用
        return { ok: true, code: "SKIP" };
      },
      REPORT_WRITE: () => createReportDraftAction(created.id, randomUUID()),
      REPORT_EXPORT: () => exportReportAction(created.id, randomUUID(), true),
      CASE_READ: async () => ({ ok: true, code: "SKIP" }),
      REPORT_READ: async () => ({ ok: true, code: "SKIP" }),
      // v1.4 Step 1：权限已就绪，尚无 Knowledge Server Action（Step 3）
      KNOWLEDGE_READ: async () => ({ ok: true, code: "SKIP" }),
      USER_ADMIN: () => listUsersAction(1),
      PASSWORD_SELF_CHANGE: async () => {
        // VIEWER 拥有自改密码：改用无 Session 验证入口存在
        return runAsUnauthenticatedTest(() =>
          changeOwnPasswordAction({
            currentPassword: "x",
            newPassword: "yyyyyyyy",
            confirmPassword: "yyyyyyyy",
          }),
        );
      },
      PASSWORD_ADMIN_RESET: () =>
        adminResetPasswordAction({
          userId: VITEST_ANALYST_USER.id,
          newPassword: "TestOnly_Reset_9x!!",
          confirmPassword: "TestOnly_Reset_9x!!",
        }),
    };

    const writePermissions = Object.values(SERVER_ACTION_PERMISSIONS).filter(
      (p) => p !== "ACTIVITY_READ" && p !== "PASSWORD_SELF_CHANGE",
    );
    const unique = [...new Set(writePermissions)];

    for (const permission of unique) {
      const probe = probes[permission];
      const result = await runWithTestAuthUser(VITEST_VIEWER_USER, probe);
      expect(result.ok, permission).toBe(false);
      if (!result.ok) expect(result.code).toBe("FORBIDDEN");
    }

    // PASSWORD_SELF_CHANGE：未登录拒绝（VIEWER 有权限，不能用 VIEWER 测 FORBIDDEN）
    const pwdDenied = await probes.PASSWORD_SELF_CHANGE();
    expect(pwdDenied.ok).toBe(false);
    if (!pwdDenied.ok) expect(pwdDenied.code).toBe("UNAUTHENTICATED");

    // USER_ADMIN create 额外入口
    const createDenied = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      createUserAction({
        username: "denied.user",
        displayName: "Denied",
        email: "denied@example.test",
        role: "VIEWER",
        initialPassword: "TestOnly_Denied_9x!",
        confirmPassword: "TestOnly_Denied_9x!",
      }),
    );
    expect(createDenied.ok).toBe(false);
    if (!createDenied.ok) expect(createDenied.code).toBe("FORBIDDEN");

    // ACTIVITY_READ：Viewer 成功；无 Session 失败
    const activityOk = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      loadMoreCaseAuditLogsAction(created.id, null, 5),
    );
    expect(activityOk.ok).toBe(true);
    const activityDenied = await runAsUnauthenticatedTest(() =>
      loadMoreCaseAuditLogsAction(created.id, null, 5),
    );
    expect(activityDenied.ok).toBe(false);
    if (!activityDenied.ok) expect(activityDenied.code).toBe("UNAUTHENTICATED");
  });
});
