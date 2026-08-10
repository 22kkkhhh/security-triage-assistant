/**
 * v1.6-M1 Playwright Foundation：唯一 E2E 入口。
 *
 * 职责：注入 test-only E2E 环境变量 → npm run db:reset-demo（独立 e2e.db）
 * → npx playwright test（Chromium，next dev）。
 *
 * 约束：
 * - 不写 .env；env 只注入到本进程派生的子进程，不落盘。
 * - 不使用 shell 专属的 `VAR=value command` 语法；统一通过 child_process
 *   spawnSync 的 env 选项传递，Windows / Linux 行为一致。
 * - DATABASE_URL 固定指向独立 prisma/e2e.db，绝不碰 prisma/dev.db
 *   （db:reset-demo 内部按 DATABASE_URL 解析删除/清空目标，见 src/lib/envConfig.ts）。
 * - BETTER_AUTH_SECRET / DEMO_AUTH_PASSWORD 为仅用于本地/CI 浏览器 E2E 的
 *   test-only 固定值，不是真实 secret，不代表任何生产凭据。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const E2E_ENV: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL: "file:./prisma/e2e.db",
  BETTER_AUTH_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET:
    "e2e-test-only-not-a-production-secret-2026-playwright",
  DEMO_AUTH_PASSWORD: "E2eTestOnly_Pass_2026!",
};

const childEnv = { ...process.env, ...E2E_ENV };

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

console.log("=== v1.6-M1 E2E：环境（test-only，非生产 secret）===");
console.log(`NODE_ENV=${E2E_ENV.NODE_ENV}`);
console.log(`DATABASE_URL=${E2E_ENV.DATABASE_URL}`);
console.log(`BETTER_AUTH_URL=${E2E_ENV.BETTER_AUTH_URL}`);
console.log("BETTER_AUTH_SECRET / DEMO_AUTH_PASSWORD：test-only 固定值（不输出明文）。");

console.log("\n=== 重置 E2E Demo 数据库（prisma/e2e.db，不影响 prisma/dev.db）===");
const resetCode = run("npm", ["run", "db:reset-demo"]);
if (resetCode !== 0) {
  console.error("db:reset-demo 失败，终止 E2E。");
  process.exit(resetCode);
}

console.log("\n=== 运行 Playwright（Chromium / next dev :3100）===");
const testCode = run("npx", ["playwright", "test"]);
process.exit(testCode);
