/**
 * v1.3 Step 2：Better Auth + Prisma 7 persistence integration。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { createCaseWithAudit } from "@/services/caseCommands";
import { auth } from "@/lib/auth";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import { toAuthUser } from "@/services/auth/toAuthUser";

const TEST_DB_FILE = path.resolve("prisma/test-better-auth-persistence.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
const FORWARD_DB_FILE = path.resolve(
  "prisma/test-auth-forward-from-v121.db",
);

const TEST_PASSWORD = "TestOnly_Password_9x!Auth";

function cleanDbFiles(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${file}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

function migrateDeploy(url: string) {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

beforeAll(async () => {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("测试需要 BETTER_AUTH_SECRET（.env）");
  }
  cleanDbFiles(TEST_DB_FILE);
  process.env.DATABASE_URL = TEST_DB_URL;
  migrateDeploy(TEST_DB_URL);
  await resetPrismaClient(TEST_DB_URL);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles(TEST_DB_FILE);
  cleanDbFiles(FORWARD_DB_FILE);
});

describe("Better Auth config + Prisma adapter", () => {
  it("auth instance initializes with prisma adapter options", () => {
    expect(auth).toBeTruthy();
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
    expect(auth.options.disabledPaths).toContain("/is-username-available");
  });
});

describe("Admin createUser + username provisioning", () => {
  it("creates credential user with username/role/enabled", async () => {
    const created = await auth.api.createUser({
      body: {
        email: "analyst@example.test",
        password: TEST_PASSWORD,
        name: "测试分析员",
        role: "ANALYST",
        data: {
          username: "Test.Analyst",
        },
      },
    });

    expect(created.user.id).toBeTruthy();
    expect(created.user.role).toBe("ANALYST");

    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: created.user.id },
      include: { accounts: true },
    });

    expect(row.username).toBe("test.analyst");
    expect(row.displayUsername).toBe("Test.Analyst");
    expect(row.email).toBe("analyst@example.test");
    expect(row.role).toBe("ANALYST");
    expect(row.enabled).toBe(true);
    expect(row).not.toHaveProperty("passwordHash");

    const credential = row.accounts.find((a) => a.providerId === "credential");
    expect(credential?.password).toBeTruthy();
    expect(credential!.password).not.toBe(TEST_PASSWORD);

    const mapped = toAuthUser(row);
    expect(mapped).toEqual({
      id: row.id,
      username: "test.analyst",
      displayName: "测试分析员",
      email: "analyst@example.test",
      role: "ANALYST",
      enabled: true,
    });
  });

  it("normalizes VIEWER / ADMIN roles and maps AuthUser", async () => {
    const viewer = await auth.api.createUser({
      body: {
        email: "viewer@example.test",
        password: TEST_PASSWORD,
        name: "测试只读员",
        role: "VIEWER",
        data: { username: "Test.Viewer" },
      },
    });
    const admin = await auth.api.createUser({
      body: {
        email: "admin@example.test",
        password: TEST_PASSWORD,
        name: "测试管理员",
        role: "ADMIN",
        data: { username: "Test.Admin" },
      },
    });
    expect(toAuthUser({
      id: viewer.user.id,
      username: "test.viewer",
      name: viewer.user.name,
      email: viewer.user.email,
      role: viewer.user.role,
      enabled: true,
    }).role).toBe("VIEWER");
    expect(admin.user.role).toBe("ADMIN");
  });

  it("rejects duplicate username (case-insensitive) and duplicate email", async () => {
    await auth.api.createUser({
      body: {
        email: "one@example.test",
        password: TEST_PASSWORD,
        name: "用户一",
        role: "ANALYST",
        data: { username: "Test.Analyst" },
      },
    });

    await expect(
      auth.api.createUser({
        body: {
          email: "two@example.test",
          password: TEST_PASSWORD,
          name: "用户二",
          role: "ANALYST",
          data: { username: "test.analyst" },
        },
      }),
    ).rejects.toBeTruthy();

    await expect(
      auth.api.createUser({
        body: {
          email: "one@example.test",
          password: TEST_PASSWORD,
          name: "用户三",
          role: "VIEWER",
          data: { username: "other.user" },
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("ignores enabled=false in create data（server-owned default true）", async () => {
    const created = await auth.api.createUser({
      body: {
        email: "enabled@example.test",
        password: TEST_PASSWORD,
        name: "启用测试",
        role: "VIEWER",
        data: {
          username: "enabled.user",
          enabled: false,
        },
      },
    });
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: created.user.id },
    });
    expect(row.enabled).toBe(true);
  });
});

describe("public signup disabled", () => {
  it("signUpEmail rejects when disableSignUp=true", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "public@example.test",
          password: TEST_PASSWORD,
          name: "公开注册",
          username: "public.user",
        },
      }),
    ).rejects.toBeTruthy();
  });
});

describe("Better Auth Admin ACL", () => {
  it("ADMIN has lifecycle perms；delete/impersonate denied；ANALYST/VIEWER denied", async () => {
    const adminCreate = await auth.api.userHasPermission({
      body: {
        role: "ADMIN",
        permissions: { user: ["create", "list", "get", "update", "set-role", "set-password"] },
      },
    });
    expect(adminCreate.success).toBe(true);

    const adminSession = await auth.api.userHasPermission({
      body: {
        role: "ADMIN",
        permissions: { session: ["list", "revoke", "delete"] },
      },
    });
    expect(adminSession.success).toBe(true);

    const adminDelete = await auth.api.userHasPermission({
      body: {
        role: "ADMIN",
        permissions: { user: ["delete"] },
      },
    });
    expect(adminDelete.success).toBe(false);

    const adminImpersonate = await auth.api.userHasPermission({
      body: {
        role: "ADMIN",
        permissions: { user: ["impersonate"] },
      },
    });
    expect(adminImpersonate.success).toBe(false);

    const adminImpersonateAdmins = await auth.api.userHasPermission({
      body: {
        role: "ADMIN",
        permissions: { user: ["impersonate-admins"] },
      },
    });
    expect(adminImpersonateAdmins.success).toBe(false);

    const analystCreate = await auth.api.userHasPermission({
      body: {
        role: "ANALYST",
        permissions: { user: ["create"] },
      },
    });
    expect(analystCreate.success).toBe(false);

    const viewerCreate = await auth.api.userHasPermission({
      body: {
        role: "VIEWER",
        permissions: { user: ["create"] },
      },
    });
    expect(viewerCreate.success).toBe(false);
  });
});

describe("CaseAuditLog actor User FK", () => {
  it("USER actor FK works；物理删除 User 被 Restrict；legacy MANUAL/SYSTEM 可读", async () => {
    const createdUser = await auth.api.createUser({
      body: {
        email: "actor@example.test",
        password: TEST_PASSWORD,
        name: "审计用户",
        role: "ANALYST",
        data: { username: "actor.user" },
      },
    });

    const analyzed = analyzeSecurityCase(caseA);
    const caseResult = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "auth-fk-case-1", actor: systemActor() },
    );
    expect(caseResult.ok).toBe(true);
    if (!caseResult.ok) return;

    const { prisma } = await import("@/lib/prisma");
    await prisma.caseAuditLog.create({
      data: {
        caseId: caseResult.case.id,
        actionType: "STATUS_CHANGED",
        actorType: "USER",
        actorId: createdUser.user.id,
        actorName: "审计用户",
        summary: "测试 USER Actor FK",
      },
    });

    await expect(
      prisma.user.delete({ where: { id: createdUser.user.id } }),
    ).rejects.toBeTruthy();

    const still = await prisma.user.findUnique({
      where: { id: createdUser.user.id },
    });
    expect(still).not.toBeNull();

    const audits = await listCaseAuditLogs({ caseId: caseResult.case.id });
    expect(
      audits.items.some((x) => x.actorType === "SYSTEM" || x.actorType === "MANUAL"),
    ).toBe(true);
    expect(audits.items.some((x) => x.actorType === "USER")).toBe(true);
    expect(
      audits.items.filter((x) => x.actorType === "SYSTEM" || x.actorType === "MANUAL")
        .every((x) => x.actorId == null),
    ).toBe(true);
  });
});

describe("migration gates", () => {
  it("empty DB migrate deploy succeeds", () => {
    const emptyFile = path.resolve("prisma/test-auth-empty-migrate.db");
    cleanDbFiles(emptyFile);
    const url = `file:${emptyFile.replace(/\\/g, "/")}`;
    migrateDeploy(url);
    expect(existsSync(emptyFile)).toBe(true);
    cleanDbFiles(emptyFile);
  });

  it("v1.2.1 forward：先应用至 audit migration，写入 null actorId，再 apply auth migration", async () => {
    cleanDbFiles(FORWARD_DB_FILE);
    const { readFileSync, readdirSync } = await import("node:fs");
    const Database = (await import("better-sqlite3")).default;
    const migrationsRoot = path.resolve("prisma/migrations");
    const authMigration = "20260809071711_add_auth_identity";
    const all = readdirSync(migrationsRoot)
      .filter((name) =>
        existsSync(path.join(migrationsRoot, name, "migration.sql")),
      )
      .sort();
    const preAuth = all.filter((name) => name !== authMigration);
    expect(preAuth.length).toBe(3);

    const db = new Database(FORWARD_DB_FILE);
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id TEXT PRIMARY KEY NOT NULL,
        checksum TEXT NOT NULL,
        finished_at DATETIME,
        migration_name TEXT NOT NULL,
        logs TEXT,
        rolled_back_at DATETIME,
        started_at DATETIME NOT NULL DEFAULT current_timestamp,
        applied_steps_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    const applySqlMigration = (name: string) => {
      const sql = readFileSync(
        path.join(migrationsRoot, name, "migration.sql"),
        "utf8",
      );
      db.exec(sql);
      db.prepare(
        `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)`,
      ).run(name, "test-forward-checksum", name);
    };

    for (const name of preAuth) {
      applySqlMigration(name);
    }

    db.exec(`
      INSERT INTO "CaseRecord" (
        "id","caseNumber","title","status","pendingChecklistCount","hasReport",
        "caseState","createdAt","updatedAt","lastActivityAt"
      ) VALUES (
        'case-forward-1','INC-FWD-001','Forward Case','INVESTIGATING',0,0,
        '{}','2026-08-08T00:00:00.000Z','2026-08-08T00:00:00.000Z','2026-08-08T00:00:00.000Z'
      );
      INSERT INTO "CaseAuditLog" (
        "id","caseId","actionType","actorType","actorId","actorName","summary","createdAt"
      ) VALUES (
        'audit-forward-1','case-forward-1','CASE_CREATED','MANUAL',NULL,'王研判','创建研判案件','2026-08-08T00:00:00.000Z'
      );
    `);
    expect(
      (
        db
          .prepare(
            `SELECT actorId FROM "CaseAuditLog" WHERE id = 'audit-forward-1'`,
          )
          .get() as { actorId: string | null }
      ).actorId,
    ).toBeNull();

    applySqlMigration(authMigration);

    const after = db
      .prepare(
        `SELECT actorId, actorType FROM "CaseAuditLog" WHERE id = 'audit-forward-1'`,
      )
      .get() as { actorId: string | null; actorType: string };
    expect(after.actorType).toBe("MANUAL");
    expect(after.actorId).toBeNull();
    expect(
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='user'`,
        )
        .get(),
    ).toBeTruthy();
    db.close();
  });
});
