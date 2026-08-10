/**
 * 本地 Demo 数据库复位（开发使用）。
 * 删除 resolveDatabaseUrl() 指向的 SQLite 文件 → migrate deploy → seed Case A/B。
 * 禁止在生产环境使用；Web UI 不提供此能力。
 *
 * Windows 上若 next dev 占用 db 文件导致 unlink EBUSY：
 * 回退为 truncate 表数据 + seed（语义等价于复位 Demo）。
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertResetDemoAllowed,
  removeSqliteDatabaseFiles,
  resolveSqliteDatabaseFilePaths,
} from "../src/lib/envConfig";

assertResetDemoAllowed();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { databaseUrl, sidecarPaths } = resolveSqliteDatabaseFilePaths({
  projectRoot: root,
});

// Ensure migrate/seed/truncate all use the same resolved URL as file deletion.
process.env.DATABASE_URL = databaseUrl;

async function truncateDemoTables() {
  const { prisma } = await import("../src/lib/prisma");
  // Knowledge：先清 mapping，再实体（Restrict FK）
  await prisma.controlClauseMapping.deleteMany();
  await prisma.ruleControlMapping.deleteMany();
  await prisma.complianceClause.deleteMany();
  await prisma.complianceDocumentVersion.deleteMany();
  await prisma.complianceControl.deleteMany();
  await prisma.complianceDocument.deleteMany();
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  console.log("已清空 Case / Auth / Knowledge tables。");
}

console.log("=== 本地 Demo 数据库复位 ===");
console.log("警告：将清空本地 Demo 数据并重新 seed Case A / Case B。");
console.log("目标 DATABASE_URL:", databaseUrl);

const { existsSync, unlinkSync } = await import("node:fs");
const removeResult = removeSqliteDatabaseFiles(sidecarPaths, {
  existsSync,
  unlinkSync,
});

if (removeResult.deletedPaths.length > 0) {
  for (const file of removeResult.deletedPaths) {
    console.log("已删除", path.relative(root, file));
  }
}

if (!removeResult.removed && removeResult.busyPaths.length > 0) {
  console.warn(
    `无法删除 ${path.relative(root, removeResult.busyPaths[0]!)}（可能被 next dev 占用）。将改为清空表数据后重新 seed。`,
  );
}

const fileRemoved = removeResult.removed;

if (fileRemoved) {
  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
} else {
  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  await truncateDemoTables();
}

execSync("npx prisma db seed", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
console.log("=== Demo 复位完成 ===");
