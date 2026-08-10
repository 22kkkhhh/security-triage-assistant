/**
 * v1.3 Step 8：User Administration / Password Lifecycle / Last ADMIN / Bootstrap。
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
import {
  adminResetPasswordAction,
  changeRoleAction,
  createUserAction,
  listUsersAction,
  setEnabledAction,
  updateDisplayNameAction,
} from "@/app/(app)/admin/users/actions";
import { changeOwnPasswordAction } from "@/app/(app)/account/actions";
import { caseA } from "@/domain/demo";
import {
  ForbiddenError,
  UnauthenticatedError,
  type AuthUser,
} from "@/domain/auth";
import { UserAdminError } from "@/domain/userAdminErrors";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { auth } from "@/lib/auth";
import { resetPrismaClient } from "@/lib/prisma";
import {
  addHandoffNoteCommand,
  createCaseWithAudit,
  updateHumanReviewCommand,
} from "@/services/caseCommands";
import {
  systemActor,
  userActor,
} from "@/services/audit/auditEventBuilder";
import {
  bootstrapAdmin,
  parseBootstrapEnv,
} from "@/services/auth/bootstrapAdmin";
import {
  adminResetUserPassword,
  changeOwnPassword,
} from "@/services/auth/passwordLifecycleService";
import {
  parseAdminResetPasswordInput,
  parseChangeRoleInput,
  parseCreateUserInput,
  parseSetEnabledInput,
  parseUpdateDisplayNameInput,
} from "@/services/auth/userAdminParsers";
import {
  changeUserRole,
  countEnabledAdmins,
  createManagedUser,
  setUserEnabled,
  updateUserDisplayName,
} from "@/services/auth/userAdminService";
import { requireAuthenticatedUser } from "@/services/auth/currentUser";
import { requirePermission } from "@/services/auth/requirePermission";
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
import { getCaseById } from "@/services/persistence/caseRepository";
import { DEMO_USER_SPECS } from "@/services/demo/seedDemoUsers";

const TEST_DB_FILE = path.resolve("prisma/test-user-administration.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
const TEST_PASSWORD = "TestOnly_UserAdmin_9x!";
const NEW_PASSWORD = "TestOnly_UserAdmin_New_9x!";

function cleanDbFiles(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${file}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
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

async function createCredential(input: {
  username: string;
  email: string;
  name: string;
  role: "ADMIN" | "ANALYST" | "VIEWER";
  password?: string;
}) {
  await auth.api.createUser({
    body: {
      email: input.email,
      password: input.password ?? TEST_PASSWORD,
      name: input.name,
      role: input.role,
      data: { username: input.username },
    },
  });
  const { prisma } = await import("@/lib/prisma");
  return prisma.user.findFirstOrThrow({ where: { username: input.username.toLowerCase() } });
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
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles(TEST_DB_FILE);
});

/** Action 授权测试需要 Vitest Auth override + 可选 DB User 行 */
async function withAdminActionAuth<T>(fn: () => Promise<T>): Promise<T> {
  await ensureVitestAuthUsersInDb();
  return runWithTestAuthUser(VITEST_ADMIN_USER, fn);
}

describe("User Administration Authorization", () => {
  it("ADMIN listUsersAction success", async () => {
    const result = await withAdminActionAuth(() => listUsersAction(1));
    expect(result.ok).toBe(true);
  });

  it("ANALYST / VIEWER / unauthenticated → FORBIDDEN / UNAUTHENTICATED", async () => {
    await ensureVitestAuthUsersInDb();
    const analyst = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      listUsersAction(1),
    );
    expect(analyst.ok).toBe(false);
    if (!analyst.ok) expect(analyst.code).toBe("FORBIDDEN");

    const viewer = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      listUsersAction(1),
    );
    expect(viewer.ok).toBe(false);
    if (!viewer.ok) expect(viewer.code).toBe("FORBIDDEN");

    const anon = await runAsUnauthenticatedTest(() => listUsersAction(1));
    expect(anon.ok).toBe(false);
    if (!anon.ok) expect(anon.code).toBe("UNAUTHENTICATED");
  });

  it("ANALYST create / VIEWER role / VIEWER disable / ANALYST reset → FORBIDDEN 无副作用", async () => {
    await ensureVitestAuthUsersInDb();
    const target = await createCredential({
      username: "target.user",
      email: "target@example.test",
      name: "目标",
      role: "VIEWER",
    });
    const beforeRole = target.role;
    const beforeEnabled = target.enabled;

    const createDenied = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      createUserAction({
        username: "nope.user",
        displayName: "Nope",
        email: "nope@example.test",
        role: "VIEWER",
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    );
    expect(createDenied.ok).toBe(false);
    if (!createDenied.ok) expect(createDenied.code).toBe("FORBIDDEN");

    const roleDenied = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      changeRoleAction({ userId: target.id, role: "ADMIN" }),
    );
    expect(roleDenied.ok).toBe(false);
    if (!roleDenied.ok) expect(roleDenied.code).toBe("FORBIDDEN");

    const disableDenied = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      setEnabledAction({ userId: target.id, enabled: false }),
    );
    expect(disableDenied.ok).toBe(false);
    if (!disableDenied.ok) expect(disableDenied.code).toBe("FORBIDDEN");

    const resetDenied = await runWithTestAuthUser(VITEST_ANALYST_USER, () =>
      adminResetPasswordAction({
        userId: target.id,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    );
    expect(resetDenied.ok).toBe(false);
    if (!resetDenied.ok) expect(resetDenied.code).toBe("FORBIDDEN");

    const { prisma } = await import("@/lib/prisma");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.role).toBe(beforeRole);
    expect(after.enabled).toBe(beforeEnabled);
    expect(
      await prisma.user.findFirst({ where: { username: "nope.user" } }),
    ).toBeNull();
  });

  it("page permission：ANALYST/VIEWER requirePermission USER_ADMIN 拒绝", async () => {
    await expect(
      runWithTestAuthUser(VITEST_ANALYST_USER, () =>
        requirePermission("USER_ADMIN"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithTestAuthUser(VITEST_VIEWER_USER, () =>
        requirePermission("USER_ADMIN"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runAsUnauthenticatedTest(() => requirePermission("USER_ADMIN")),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("User Creation", () => {
  it("create VIEWER / ANALYST / ADMIN；username lowercase；enabled true；credential 存在且非明文", async () => {
    const viewer = await createManagedUser({
      username: "Temp.Viewer",
      displayName: "临时只读",
      email: "temp.viewer@example.test",
      role: "VIEWER",
      initialPassword: TEST_PASSWORD,
    });
    expect(viewer.username).toBe("temp.viewer");
    expect(viewer.enabled).toBe(true);
    expect(viewer.role).toBe("VIEWER");

    const analyst = await createManagedUser({
      username: "temp.analyst",
      displayName: "临时分析",
      email: "temp.analyst@example.test",
      role: "ANALYST",
      initialPassword: TEST_PASSWORD,
    });
    expect(analyst.role).toBe("ANALYST");

    const admin = await createManagedUser({
      username: "temp.admin",
      displayName: "临时管理",
      email: "temp.admin@example.test",
      role: "ADMIN",
      initialPassword: TEST_PASSWORD,
    });
    expect(admin.role).toBe("ADMIN");
    expect(await countEnabledAdmins()).toBeGreaterThanOrEqual(1);

    const { prisma } = await import("@/lib/prisma");
    const account = await prisma.account.findFirstOrThrow({
      where: { userId: viewer.id, providerId: "credential" },
    });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe(TEST_PASSWORD);
  });

  it("duplicate username / email reject；multi-role / invalid role reject", async () => {
    await createManagedUser({
      username: "dup.user",
      displayName: "Dup",
      email: "dup@example.test",
      role: "VIEWER",
      initialPassword: TEST_PASSWORD,
    });
    await expect(
      createManagedUser({
        username: "dup.user",
        displayName: "Dup2",
        email: "dup2@example.test",
        role: "VIEWER",
        initialPassword: TEST_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });

    await expect(
      createManagedUser({
        username: "dup.other",
        displayName: "Dup3",
        email: "dup@example.test",
        role: "VIEWER",
        initialPassword: TEST_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });

    expect(() =>
      parseCreateUserInput({
        username: "x",
        displayName: "X",
        email: "x@example.test",
        role: "ADMIN,ANALYST",
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    ).toThrow(UserAdminError);

    expect(() =>
      parseCreateUserInput({
        username: "validuser",
        displayName: "X",
        email: "x2@example.test",
        role: "superadmin",
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    ).toThrow(/角色无效/);

    expect(() =>
      parseCreateUserInput({
        username: "validuser",
        displayName: "X",
        email: "x3@example.test",
        role: ["ADMIN"],
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    ).toThrow(UserAdminError);
  });

  it("create Action 默认 enabled；Client 不得提交 enabled", async () => {
    const created = await withAdminActionAuth(() =>
      createUserAction({
        username: "action.create",
        displayName: "Action Create",
        email: "action.create@example.test",
        role: "VIEWER",
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    );
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.user?.enabled).toBe(true);

    const withEnabled = await withAdminActionAuth(() =>
      createUserAction({
        username: "action.enabled",
        displayName: "Bad",
        email: "action.enabled@example.test",
        role: "VIEWER",
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
        enabled: false,
      }),
    );
    expect(withEnabled.ok).toBe(false);
  });
});

describe("displayName snapshot invariant", () => {
  it("更新 displayName：AuthUser 新名称；旧 Audit/HR 快照不变；新 Audit 用新名", async () => {
    const user = await createCredential({
      username: "name.user",
      email: "name.user@example.test",
      name: "旧显示名",
      role: "ANALYST",
    });
    const actor: AuthUser = {
      id: user.id,
      username: "name.user",
      displayName: "旧显示名",
      email: user.email,
      role: "ANALYST",
      enabled: true,
    };

    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: randomUUID(), actor: userActor(actor) },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);

    // 必须真实改变 semantic（Case A 草稿已有结论时 NO-OP 不会改责任人）
    const hr = await updateHumanReviewCommand({
      caseId: created.case.id,
      operationId: randomUUID(),
      actor: userActor(actor),
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
      humanRiskLevel: "HIGH",
      baseUpdatedAt: created.case.updatedAt,
    });
    expect(hr.ok).toBe(true);
    if (!hr.ok) throw new Error(hr.error);
    expect(hr.alreadyApplied).not.toBe(true);
    expect(hr.case.caseState.humanReview?.reviewer).toBe("旧显示名");
    expect(hr.case.caseState.humanReview?.reviewedByUserId).toBe(user.id);

    const auditsBefore = await listCaseAuditLogs({
      caseId: created.case.id,
      limit: 50,
    });
    const oldActorNames = auditsBefore.items.map((a) => a.actorName);

    await updateUserDisplayName({
      userId: user.id,
      displayName: "新显示名",
    });

    const headers = await signInHeaders("name.user");
    const reloaded = await requireAuthenticatedUser(headers);
    expect(reloaded.displayName).toBe("新显示名");

    const auditsAfter = await listCaseAuditLogs({
      caseId: created.case.id,
      limit: 50,
    });
    expect(auditsAfter.items.map((a) => a.actorName)).toEqual(oldActorNames);
    expect(oldActorNames.every((n) => n === "旧显示名" || n === "SYSTEM")).toBe(
      true,
    );

    const reloadedCase = await getCaseById(created.case.id);
    expect(reloadedCase!.caseState.humanReview?.reviewer).toBe("旧显示名");

    const newActor: AuthUser = { ...actor, displayName: "新显示名" };
    const handoff = await addHandoffNoteCommand({
      caseId: created.case.id,
      note: "名称变更后交接",
      operationId: randomUUID(),
      actor: userActor(newActor),
    });
    expect(handoff.ok).toBe(true);
    const auditsNew = await listCaseAuditLogs({
      caseId: created.case.id,
      limit: 50,
    });
    expect(auditsNew.items.some((a) => a.actorName === "新显示名")).toBe(true);
    expect(auditsNew.items.some((a) => a.actorName === "旧显示名")).toBe(true);
  });
});

describe("Role / enabled / last ADMIN", () => {
  it("ANALYST→VIEWER 立即生效；VIEWER→ANALYST 可恢复", async () => {
    // 系统须始终有 enabled ADMIN；本用例保留一个无关 ADMIN
    await createCredential({
      username: "keeper.admin",
      email: "keeper.admin@example.test",
      name: "保留管理员",
      role: "ADMIN",
    });
    const user = await createCredential({
      username: "role.user",
      email: "role.user@example.test",
      name: "角色用户",
      role: "ANALYST",
    });
    const headers = await signInHeaders("role.user");
    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).resolves.toMatchObject({ role: "ANALYST" });

    await changeUserRole({ userId: user.id, role: "VIEWER" });
    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      requirePermission("CASE_READ", headers),
    ).resolves.toMatchObject({ role: "VIEWER" });

    await changeUserRole({ userId: user.id, role: "ANALYST" });
    await expect(
      requirePermission("CASE_STATUS_CHANGE", headers),
    ).resolves.toMatchObject({ role: "ANALYST" });
  });

  it("存在另一 enabled ADMIN 时允许 ADMIN→ANALYST；最后 ADMIN 降级/停用拒绝且无 DB 变更", async () => {
    const a = await createCredential({
      username: "admin.a",
      email: "admin.a@example.test",
      name: "管理员A",
      role: "ADMIN",
    });
    const b = await createCredential({
      username: "admin.b",
      email: "admin.b@example.test",
      name: "管理员B",
      role: "ADMIN",
    });
    expect(await countEnabledAdmins()).toBe(2);

    await changeUserRole({ userId: a.id, role: "ANALYST" });
    expect(await countEnabledAdmins()).toBe(1);

    await expect(
      changeUserRole({ userId: b.id, role: "VIEWER" }),
    ).rejects.toMatchObject({ code: "LAST_ENABLED_ADMIN_REQUIRED" });
    const { prisma } = await import("@/lib/prisma");
    const bRow = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect(bRow.role).toBe("ADMIN");
    expect(bRow.enabled).toBe(true);

    await expect(
      setUserEnabled({ userId: b.id, enabled: false }, new Headers()),
    ).rejects.toMatchObject({ code: "LAST_ENABLED_ADMIN_REQUIRED" });
    const b2 = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect(b2.enabled).toBe(true);
  });

  it("disabled ADMIN 不计入 enabled ADMIN；可再创建 ADMIN", async () => {
    const a = await createCredential({
      username: "only.admin",
      email: "only.admin@example.test",
      name: "唯一管理员",
      role: "ADMIN",
    });
    const disabledAdmin = await createCredential({
      username: "off.admin",
      email: "off.admin@example.test",
      name: "停用管理员",
      role: "ADMIN",
    });
    const adminHdrs = await signInHeaders("only.admin");
    await setUserEnabled({ userId: disabledAdmin.id, enabled: false }, adminHdrs);
    expect(await countEnabledAdmins()).toBe(1);

    await expect(
      changeUserRole({ userId: a.id, role: "ANALYST" }),
    ).rejects.toMatchObject({ code: "LAST_ENABLED_ADMIN_REQUIRED" });

    const second = await createManagedUser({
      username: "second.admin",
      displayName: "第二管理员",
      email: "second.admin@example.test",
      role: "ADMIN",
      initialPassword: TEST_PASSWORD,
    });
    expect(second.role).toBe("ADMIN");
    expect(await countEnabledAdmins()).toBe(2);
  });

  it("disable ANALYST：下一请求拒绝；Session 吊销；re-enable 需重新登录", async () => {
    await createCredential({
      username: "ops.admin",
      email: "ops.admin@example.test",
      name: "运维管理员",
      role: "ADMIN",
    });
    const analyst = await createCredential({
      username: "ops.analyst",
      email: "ops.analyst@example.test",
      name: "运维分析",
      role: "ANALYST",
    });
    const analystHdrs = await signInHeaders("ops.analyst");
    await expect(
      requirePermission("CASE_READ", analystHdrs),
    ).resolves.toBeTruthy();

    const adminHdrs = await signInHeaders("ops.admin");
    const disabled = await setUserEnabled(
      { userId: analyst.id, enabled: false },
      adminHdrs,
    );
    expect(disabled.user.enabled).toBe(false);
    expect(disabled.sessionRevokeFailed).toBe(false);

    // 成功吊销 Session 后下一请求为未认证；若 Cookie 仍在则 enabled fail-closed → FORBIDDEN
    await expect(requirePermission("CASE_READ", analystHdrs)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ForbiddenError || err instanceof UnauthenticatedError,
    );

    const { prisma } = await import("@/lib/prisma");
    const sessions = await prisma.session.count({
      where: { userId: analyst.id },
    });
    expect(sessions).toBe(0);

    // 即使重新拿到 BA Session，enabled=false 仍拒绝
    const disabledLogin = await signInHeaders("ops.analyst");
    await expect(
      requireAuthenticatedUser(disabledLogin),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await setUserEnabled({ userId: analyst.id, enabled: true }, adminHdrs);
    await expect(
      requirePermission("CASE_READ", analystHdrs),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    const fresh = await signInHeaders("ops.analyst");
    await expect(requirePermission("CASE_READ", fresh)).resolves.toMatchObject({
      role: "ANALYST",
      enabled: true,
    });
  });

  it("两个 ADMIN 并发危险 mutation 后 enabled ADMIN >= 1", async () => {
    const a = await createCredential({
      username: "conc.a",
      email: "conc.a@example.test",
      name: "并发A",
      role: "ADMIN",
    });
    const b = await createCredential({
      username: "conc.b",
      email: "conc.b@example.test",
      name: "并发B",
      role: "ADMIN",
    });

    const results = await Promise.allSettled([
      setUserEnabled({ userId: b.id, enabled: false }, new Headers()),
      setUserEnabled({ userId: a.id, enabled: false }, new Headers()),
      changeUserRole({ userId: a.id, role: "VIEWER" }),
      changeUserRole({ userId: b.id, role: "ANALYST" }),
    ]);

    const admins = await countEnabledAdmins();
    expect(admins).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });
});

describe("Self password / Admin reset", () => {
  it("三角色自改密码；错密/确认不一致拒绝；新密可登录旧密失败；其他 Session 吊销", async () => {
    for (const role of ["VIEWER", "ANALYST", "ADMIN"] as const) {
      const username = `pwd.${role.toLowerCase()}`;
      const user = await createCredential({
        username,
        email: `${username}@example.test`,
        name: `密码${role}`,
        role,
      });
      const sessionA = await signInHeaders(username);
      const sessionB = await signInHeaders(username);

      await expect(
        changeOwnPassword({
          authUser: {
            id: user.id,
            username,
            displayName: user.name,
            email: user.email,
            role,
            enabled: true,
          },
          currentPassword: "wrong-password-xx",
          newPassword: NEW_PASSWORD,
          headers: sessionA,
        }),
      ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_FAILED" });

      expect(() =>
        parseCreateUserInput({
          username: "mismatch.user",
          displayName: "x",
          email: "x@t.test",
          role: "VIEWER",
          initialPassword: "aaaaaaaa",
          confirmPassword: "bbbbbbbb",
        }),
      ).toThrow(/不一致/);

      await changeOwnPassword({
        authUser: {
          id: user.id,
          username,
          displayName: user.name,
          email: user.email,
          role,
          enabled: true,
        },
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        headers: sessionA,
      });

      await expect(
        requireAuthenticatedUser(sessionB),
      ).rejects.toBeInstanceOf(UnauthenticatedError);

      await expect(
        auth.api.signInUsername({
          body: { username, password: TEST_PASSWORD },
        }),
      ).rejects.toBeTruthy();

      const again = await signInHeaders(username, NEW_PASSWORD);
      await expect(requireAuthenticatedUser(again)).resolves.toMatchObject({
        username,
      });

      // 清理：避免下一角色冲突（每 beforeEach 清库，无需）
      void role;
    }
  });

  it("confirm mismatch / Client 不得指定其他 userId（parser reject）", async () => {
    expect(() =>
      parseAdminResetPasswordInput({
        userId: "u1",
        newPassword: NEW_PASSWORD,
        confirmPassword: "other-password-xx",
      }),
    ).toThrow(/不一致/);

    await ensureVitestAuthUsersInDb();
    const parsedDenied = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      changeOwnPasswordAction({
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: "mismatch-xx",
        userId: "someone-else",
      }),
    );
    expect(parsedDenied.ok).toBe(false);
  });

  it("ADMIN 重置他人：旧密失败新密成功；Session 吊销；可重置 disabled；禁止重置自己", async () => {
    const admin = await createCredential({
      username: "reset.admin",
      email: "reset.admin@example.test",
      name: "重置管理员",
      role: "ADMIN",
    });
    const target = await createCredential({
      username: "reset.target",
      email: "reset.target@example.test",
      name: "重置目标",
      role: "VIEWER",
    });
    const targetHdrs = await signInHeaders("reset.target");
    const adminHdrs = await signInHeaders("reset.admin");

    const actor: AuthUser = {
      id: admin.id,
      username: "reset.admin",
      displayName: "重置管理员",
      email: admin.email,
      role: "ADMIN",
      enabled: true,
    };

    await expect(
      adminResetUserPassword({
        actor,
        targetUserId: admin.id,
        newPassword: NEW_PASSWORD,
        headers: adminHdrs,
      }),
    ).rejects.toMatchObject({ code: "ADMIN_RESET_SELF_FORBIDDEN" });

    const reset = await adminResetUserPassword({
      actor,
      targetUserId: target.id,
      newPassword: NEW_PASSWORD,
      headers: adminHdrs,
    });
    expect(reset.ok).toBe(true);
    expect(reset.sessionRevokeFailed).toBe(false);

    await expect(requireAuthenticatedUser(targetHdrs)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(
      auth.api.signInUsername({
        body: { username: "reset.target", password: TEST_PASSWORD },
      }),
    ).rejects.toBeTruthy();
    await expect(
      auth.api.signInUsername({
        body: { username: "reset.target", password: NEW_PASSWORD },
      }),
    ).resolves.toBeTruthy();

    await setUserEnabled({ userId: target.id, enabled: false }, adminHdrs);
    const resetDisabled = await adminResetUserPassword({
      actor,
      targetUserId: target.id,
      newPassword: `${NEW_PASSWORD}2`,
      headers: adminHdrs,
    });
    expect(resetDisabled.targetStillDisabled).toBe(true);
    // Better Auth 层可能仍接受凭据；产品边界用 enabled=false fail-closed
    const disabledLogin = await signInHeaders(
      "reset.target",
      `${NEW_PASSWORD}2`,
    );
    await expect(
      requireAuthenticatedUser(disabledLogin),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await ensureVitestAuthUsersInDb();
    const viewerReset = await runWithTestAuthUser(VITEST_VIEWER_USER, () =>
      adminResetPasswordAction({
        userId: target.id,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
    );
    expect(viewerReset.ok).toBe(false);
    if (!viewerReset.ok) expect(viewerReset.code).toBe("FORBIDDEN");
  });
});

describe("Mass assignment", () => {
  it("profile / role / enabled / reset 拒绝未知键与特权字段注入", async () => {
    expect(() =>
      parseUpdateDisplayNameInput({
        userId: "u1",
        displayName: "ok",
        role: "ADMIN",
        enabled: true,
        email: "x@y.z",
        banned: false,
      }),
    ).toThrow(/不允许字段/);

    expect(() =>
      parseChangeRoleInput({
        userId: "u1",
        role: "VIEWER",
        enabled: true,
      }),
    ).toThrow(/不允许字段/);

    expect(() =>
      parseSetEnabledInput({
        userId: "u1",
        enabled: false,
        role: "ADMIN",
      }),
    ).toThrow(/不允许字段/);

    expect(() =>
      parseAdminResetPasswordInput({
        userId: "u1",
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
        actorId: "evil",
        role: "ADMIN",
        enabled: true,
      }),
    ).toThrow(/不允许字段/);

    const injected = await withAdminActionAuth(() =>
      updateDisplayNameAction({
        userId: VITEST_VIEWER_USER.id,
        displayName: "安全名",
        role: "ADMIN",
        enabled: true,
      }),
    );
    expect(injected.ok).toBe(false);
  });
});

describe("Bootstrap Admin", () => {
  it("无 enabled ADMIN → 创建；凭据可用；二次拒绝；缺 env 拒绝；不创建 Demo", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.deleteMany();
    expect(await countEnabledAdmins()).toBe(0);

    expect(() =>
      parseBootstrapEnv({} as NodeJS.ProcessEnv),
    ).toThrow(/缺少 bootstrap/);

    const password = "Bootstrap_Only_Strong_9x!";
    const first = await bootstrapAdmin({
      username: "Boot.Admin",
      email: "boot.admin@example.test",
      displayName: "Bootstrap 管理员",
      password,
    });
    expect(first.role).toBe("ADMIN");
    expect(first.enabled).toBe(true);
    expect(first.username).toBe("boot.admin");

    await expect(
      auth.api.signInUsername({
        body: { username: "boot.admin", password },
      }),
    ).resolves.toBeTruthy();

    await expect(
      bootstrapAdmin({
        username: "boot.admin2",
        email: "boot.admin2@example.test",
        displayName: "第二",
        password,
      }),
    ).rejects.toMatchObject({ code: "BOOTSTRAP_ADMIN_EXISTS" });

    for (const demo of DEMO_USER_SPECS) {
      expect(
        await prisma.user.findUnique({ where: { username: demo.username } }),
      ).toBeNull();
    }
  });
});

describe("CaseAuditLog 不被 User Admin 污染", () => {
  it("用户管理操作不增加 Case Audit", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: randomUUID(), actor: systemActor() },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    const before = await listCaseAuditLogs({
      caseId: created.case.id,
      limit: 100,
    });

    await withAdminActionAuth(async () => {
      await createUserAction({
        username: "audit.safe",
        displayName: "审计安全",
        email: "audit.safe@example.test",
        role: "VIEWER",
        initialPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      });
    });

    const after = await listCaseAuditLogs({
      caseId: created.case.id,
      limit: 100,
    });
    expect(after.items.length).toBe(before.items.length);
  });
});

describe("Security surface", () => {
  it("active path 不暴露 removeUser / impersonate / ban 产品入口", async () => {
    const fs = await import("node:fs");
    const adminClient = fs.readFileSync(
      path.resolve("src/components/admin/AdminUsersClient.tsx"),
      "utf8",
    );
    expect(adminClient).not.toContain("removeUser");
    expect(adminClient).not.toContain("impersonate");
    expect(adminClient).not.toContain("banUser");
    expect(adminClient).not.toContain("passwordHash");

    const service = fs.readFileSync(
      path.resolve("src/services/auth/userAdminService.ts"),
      "utf8",
    );
    expect(service).not.toContain("passwordHash");
    expect(service).not.toMatch(/Account\.password\s*=/);
  });
});
