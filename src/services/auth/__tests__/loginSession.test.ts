/**
 * v1.3 Step 3：Login / Session / Auth DAL / Demo seed / HTTP surface。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ForbiddenError,
  UnauthenticatedError,
} from "@/domain/auth";
import { auth } from "@/lib/auth";
import { resetPrismaClient } from "@/lib/prisma";
import {
  getCurrentAuthUser,
  requireAuthenticatedUser,
} from "@/services/auth/currentUser";
import { InvalidAuthUserStateError } from "@/services/auth/toAuthUser";
import {
  assertDemoProvisioningAllowed,
  getDemoAuthPassword,
  seedDemoUsers,
} from "@/services/demo/seedDemoUsers";

const TEST_DB_FILE = path.resolve("prisma/test-login-session.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
const TEST_PASSWORD = "TestOnly_Login_Session_9x!";

function cleanDbFiles(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${file}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

async function createCredentialUser(input: {
  username: string;
  email: string;
  name: string;
  role: "ADMIN" | "ANALYST" | "VIEWER";
  password?: string;
}) {
  return auth.api.createUser({
    body: {
      email: input.email,
      password: input.password ?? TEST_PASSWORD,
      name: input.name,
      role: input.role,
      data: { username: input.username },
    },
  });
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
  return { headers, data: result.response };
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
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles(TEST_DB_FILE);
});

describe("Auth DAL", () => {
  it("no session → getCurrentAuthUser null；require → UnauthenticatedError", async () => {
    expect(await getCurrentAuthUser(new Headers())).toBeNull();
    await expect(requireAuthenticatedUser(new Headers())).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("valid session → AuthUser from DB（displayName/username/role）", async () => {
    await createCredentialUser({
      username: "Test.Analyst",
      email: "analyst@example.test",
      name: "测试分析员",
      role: "ANALYST",
    });
    const { headers } = await signInHeaders("Test.Analyst");
    const user = await requireAuthenticatedUser(headers);
    expect(user.username).toBe("test.analyst");
    expect(user.displayName).toBe("测试分析员");
    expect(user.role).toBe("ANALYST");
    expect(user.enabled).toBe(true);
  });

  it("enabled=false → ForbiddenError（不是未登录）", async () => {
    const created = await createCredentialUser({
      username: "disabled.user",
      email: "disabled@example.test",
      name: "停用用户",
      role: "ANALYST",
    });
    const { headers } = await signInHeaders("disabled.user");
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: created.user.id },
      data: { enabled: false },
    });
    await expect(requireAuthenticatedUser(headers)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await getCurrentAuthUser(headers)).not.toBeNull();
  });

  it("session exists but User missing → UnauthenticatedError", async () => {
    const created = await createCredentialUser({
      username: "ghost.user",
      email: "ghost@example.test",
      name: "将删除",
      role: "VIEWER",
    });
    const { headers } = await signInHeaders("ghost.user");
    const { prisma } = await import("@/lib/prisma");
    await prisma.session.deleteMany({ where: { userId: created.user.id } });
    await prisma.account.deleteMany({ where: { userId: created.user.id } });
    await prisma.user.delete({ where: { id: created.user.id } });
    await expect(requireAuthenticatedUser(headers)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("invalid role → InvalidAuthUserStateError", async () => {
    const created = await createCredentialUser({
      username: "bad.role",
      email: "badrole@example.test",
      name: "坏角色",
      role: "ANALYST",
    });
    const { headers } = await signInHeaders("bad.role");
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: created.user.id },
      data: { role: "admin" },
    });
    await expect(requireAuthenticatedUser(headers)).rejects.toBeInstanceOf(
      InvalidAuthUserStateError,
    );
  });

  it("DB role / displayName change reflected on next require", async () => {
    const created = await createCredentialUser({
      username: "fresh.user",
      email: "fresh@example.test",
      name: "旧显示名",
      role: "ANALYST",
    });
    const { headers } = await signInHeaders("fresh.user");
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: created.user.id },
      data: { role: "VIEWER", name: "新显示名" },
    });
    const next = await requireAuthenticatedUser(headers);
    expect(next.role).toBe("VIEWER");
    expect(next.displayName).toBe("新显示名");
  });
});

describe("Login / Session", () => {
  it("correct username/password → success；wrong / nonexistent → failure", async () => {
    await createCredentialUser({
      username: "login.user",
      email: "login@example.test",
      name: "登录用户",
      role: "ANALYST",
    });
    const ok = await auth.api.signInUsername({
      body: { username: "login.user", password: TEST_PASSWORD },
    });
    expect(ok.user).toBeTruthy();

    await expect(
      auth.api.signInUsername({
        body: { username: "login.user", password: "WrongPassword_9x!" },
      }),
    ).rejects.toBeTruthy();

    await expect(
      auth.api.signInUsername({
        body: { username: "no.such.user", password: TEST_PASSWORD },
      }),
    ).rejects.toBeTruthy();
  });

  it("uppercase username logs into same account（plugin normalize）", async () => {
    await createCredentialUser({
      username: "Case.User",
      email: "case@example.test",
      name: "大小写",
      role: "VIEWER",
    });
    const a = await signInHeaders("Case.User");
    const b = await signInHeaders("case.user");
    const ua = await requireAuthenticatedUser(a.headers);
    const ub = await requireAuthenticatedUser(b.headers);
    expect(ua.id).toBe(ub.id);
    expect(ua.username).toBe("case.user");
  });

  it("session persisted；logout / revoke → Unauthenticated", async () => {
    await createCredentialUser({
      username: "sess.user",
      email: "sess@example.test",
      name: "会话用户",
      role: "ANALYST",
    });
    const { headers } = await signInHeaders("sess.user");
    const { prisma } = await import("@/lib/prisma");
    expect(await prisma.session.count()).toBeGreaterThan(0);

    await auth.api.signOut({ headers });
    await expect(requireAuthenticatedUser(headers)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );

    const again = await signInHeaders("sess.user");
    const session = await auth.api.getSession({
      headers: again.headers,
      query: { disableCookieCache: true },
    });
    expect(session?.session?.token).toBeTruthy();
    await auth.api.revokeSession({
      body: { token: session!.session.token },
      headers: again.headers,
    });
    await expect(
      requireAuthenticatedUser(again.headers),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("enabled=false after login → next protected request denied", async () => {
    const created = await createCredentialUser({
      username: "live.disable",
      email: "livedisable@example.test",
      name: "动态停用",
      role: "ADMIN",
    });
    const { headers } = await signInHeaders("live.disable");
    expect((await requireAuthenticatedUser(headers)).role).toBe("ADMIN");
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: created.user.id },
      data: { enabled: false },
    });
    await expect(requireAuthenticatedUser(headers)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("HTTP surface / config", () => {
  it("public signup still disabled；username availability disabled", async () => {
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
    expect(auth.options.disabledPaths).toContain("/is-username-available");
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "public@example.test",
          password: TEST_PASSWORD,
          name: "公开",
          username: "public.user",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("auth handler exports via toNextJsHandler shape", async () => {
    const mod = await import("@/app/api/auth/[...all]/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });
});

describe("Demo users seed", () => {
  it("creates demo-admin/analyst/viewer；idempotent；production guard", async () => {
    const first = await seedDemoUsers();
    expect(first.created.sort()).toEqual(
      ["demo-admin", "demo-analyst", "demo-viewer"].sort(),
    );
    const second = await seedDemoUsers();
    expect(second.created).toEqual([]);
    expect(second.skipped.sort()).toEqual(
      ["demo-admin", "demo-analyst", "demo-viewer"].sort(),
    );

    const { prisma } = await import("@/lib/prisma");
    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: "demo-admin" },
    });
    expect(admin.role).toBe("ADMIN");
    expect(admin.enabled).toBe(true);
    expect(admin.email).toBe("demo-admin@example.test");

    const signed = await signInHeaders("demo-analyst", getDemoAuthPassword());
    expect((await requireAuthenticatedUser(signed.headers)).role).toBe(
      "ANALYST",
    );

    expect(() => assertDemoProvisioningAllowed("production")).toThrow(
      /production/,
    );
    expect(assertDemoProvisioningAllowed("test")).toBeUndefined();
  });
});
