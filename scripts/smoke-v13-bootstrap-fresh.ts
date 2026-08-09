/**
 * Fresh DB bootstrap admin smoke（isolated SQLite；不污染 demo DB）。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { auth } from "../src/lib/auth";
import { resetPrismaClient } from "../src/lib/prisma";
import { bootstrapAdmin, parseBootstrapEnv } from "../src/services/auth/bootstrapAdmin";
import { countEnabledAdmins } from "../src/services/auth/userAdminService";
import { UserAdminError } from "../src/domain/userAdminErrors";

const DB = path.resolve("prisma/test-bootstrap-fresh-rc.db");
const URL = `file:${DB.replace(/\\/g, "/")}`;

function clean() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${DB}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

async function main() {
  clean();
  process.env.DATABASE_URL = URL;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: URL },
    stdio: "pipe",
  });
  await resetPrismaClient(URL);

  if ((await countEnabledAdmins()) !== 0) {
    throw new Error("fresh DB 不应已有 ADMIN");
  }

  try {
    parseBootstrapEnv({} as NodeJS.ProcessEnv);
    throw new Error("缺 env 应拒绝");
  } catch (error) {
    if (!(error instanceof UserAdminError) || error.code !== "BOOTSTRAP_ENV_MISSING") {
      throw error;
    }
  }

  const password = "Bootstrap_RC_Only_Strong_9x!";
  const first = await bootstrapAdmin({
    username: "rc.boot.admin",
    email: "rc.boot.admin@example.test",
    displayName: "RC Bootstrap 管理员",
    password,
  });
  if (first.role !== "ADMIN" || !first.enabled) {
    throw new Error("bootstrap 结果无效");
  }
  await auth.api.signInUsername({
    body: { username: "rc.boot.admin", password },
  });

  try {
    await bootstrapAdmin({
      username: "rc.boot.admin2",
      email: "rc.boot.admin2@example.test",
      displayName: "第二",
      password,
    });
    throw new Error("二次 bootstrap 应拒绝");
  } catch (error) {
    if (!(error instanceof UserAdminError) || error.code !== "BOOTSTRAP_ADMIN_EXISTS") {
      throw error;
    }
  }

  if ((await countEnabledAdmins()) !== 1) {
    throw new Error("enabled ADMIN 应恰好为 1");
  }

  console.log("smoke-v13-bootstrap-fresh: OK");
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  clean();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
