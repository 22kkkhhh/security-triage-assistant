/**
 * 本地 Demo 数据库复位（开发使用）。
 * 清空 prisma/dev.db → migrate deploy → seed Case A/B。
 * 禁止在生产环境使用；Web UI 不提供此能力。
 *
 * Windows 上若 next dev 占用 db 文件导致 unlink EBUSY：
 * 回退为 truncate 表数据 + seed（语义等价于复位 Demo）。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertResetDemoAllowed } from "../src/lib/envConfig";

assertResetDemoAllowed();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = path.join(root, "prisma", "dev.db");

function removeDb(): boolean {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${dbFile}${suffix}`;
    if (!existsSync(file)) continue;
    try {
      unlinkSync(file);
      console.log("已删除", path.relative(root, file));
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "EBUSY" || code === "EPERM") {
        console.warn(
          `无法删除 ${path.relative(root, file)}（${code}，可能被 next dev 占用）。将改为清空表数据后重新 seed。`,
        );
        return false;
      }
      throw error;
    }
  }
  return true;
}

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

const fileRemoved = removeDb();

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
