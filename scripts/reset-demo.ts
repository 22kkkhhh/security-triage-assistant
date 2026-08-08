/**
 * 本地 Demo 数据库复位（开发/面试前使用）。
 * 清空 prisma/dev.db → migrate deploy → seed Case A/B。
 * 禁止在生产环境使用；Web UI 不提供此能力。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dbFile = path.join(root, "prisma", "dev.db");

function removeDb() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${dbFile}${suffix}`;
    if (existsSync(file)) {
      unlinkSync(file);
      console.log("已删除", path.relative(root, file));
    }
  }
}

console.log("=== 本地 Demo 数据库复位 ===");
console.log("警告：将清空 prisma/dev.db 并重新 seed Case A / Case B。");
removeDb();
execSync("npx prisma migrate deploy", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
execSync("npx prisma db seed", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
console.log("=== Demo 复位完成 ===");
