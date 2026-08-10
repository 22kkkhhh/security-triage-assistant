/**
 * v1.6-M1 唯一 E2E 入口。
 *
 * 职责：注入 test-only E2E 环境变量 → npm run db:reset-demo（独立 e2e.db）
 * → 分两个 Phase 依次运行 Playwright（Chromium，各自独立 next dev :3100）：
 *
 * - Phase 1（正常路径）：E2E_HARNESS=0，
 *   `playwright test --grep-invert @fail-closed`
 *   覆盖 auth smoke / E2E-01 / E2E-02 / E2E-03，必须不受 fail-closed seam 污染。
 * - Phase 2（fail-closed 路径）：E2E_HARNESS=1 +
 *   E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE=1，
 *   `playwright test --grep @fail-closed`
 *   覆盖 E2E-04：强制 compliance resolver 进入既有 catch，验证 UI 不得将
 *   resolver failure 伪装为「真实零 findings」。
 *
 * 两个 Phase 都使用同一个 npm run db:reset-demo 产出的 prisma/e2e.db；
 * E2E-04 只读且不依赖具体业务数据值，因此 Phase 2 不需要也不会再次 reset。
 * Phase 1 结束、Next dev server 完全退出后才会启动 Phase 2 的 next dev；
 * 不会同时启动两个 Next server。
 *
 * 约束：
 * - 不写 .env；env 只注入到本进程派生的子进程，不落盘。
 * - 不使用 shell 专属的 `VAR=value command` 语法；统一通过 child_process
 *   spawnSync 的 env 选项传递，Windows / Linux 行为一致。
 * - DATABASE_URL 固定指向独立 prisma/e2e.db，绝不碰 prisma/dev.db
 *   （db:reset-demo 内部按 DATABASE_URL 解析删除/清空目标，见 src/lib/envConfig.ts）。
 * - BETTER_AUTH_SECRET / DEMO_AUTH_PASSWORD 为仅用于本地/CI 浏览器 E2E 的
 *   test-only 固定值，不是真实 secret，不代表任何生产凭据。
 * - E2E_HARNESS / E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE 仅是本进程派生
 *   子进程的临时环境变量；配合 NODE_ENV=development + 精确 e2e.db DATABASE_URL
 *   才会被 src/lib/e2eHarness.ts 采信，production 环境代码级不可能触发。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BASE_E2E_ENV: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL: "file:./prisma/e2e.db",
  BETTER_AUTH_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET:
    "e2e-test-only-not-a-production-secret-2026-playwright",
  DEMO_AUTH_PASSWORD: "E2eTestOnly_Pass_2026!",
};

function run(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): number {
  const env = { ...process.env, ...BASE_E2E_ENV, ...extraEnv };
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

console.log("=== v1.6-M1 E2E：环境（test-only，非生产 secret）===");
console.log(`NODE_ENV=${BASE_E2E_ENV.NODE_ENV}`);
console.log(`DATABASE_URL=${BASE_E2E_ENV.DATABASE_URL}`);
console.log(`BETTER_AUTH_URL=${BASE_E2E_ENV.BETTER_AUTH_URL}`);
console.log("BETTER_AUTH_SECRET / DEMO_AUTH_PASSWORD：test-only 固定值（不输出明文）。");

console.log("\n=== 重置 E2E Demo 数据库（prisma/e2e.db，不影响 prisma/dev.db）===");
const resetCode = run("npm", ["run", "db:reset-demo"]);
if (resetCode !== 0) {
  console.error("db:reset-demo 失败，终止 E2E。");
  process.exit(resetCode);
}

console.log(
  "\n=== Phase 1：正常路径（auth smoke / E2E-01 / E2E-02 / E2E-03，fail-closed seam 关闭）===",
);
const phase1Code = run(
  "npx",
  ["playwright", "test", "--grep-invert", "@fail-closed"],
  {
    E2E_HARNESS: "0",
    E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE: "0",
  },
);
console.log(`Phase 1 结束，exit code = ${phase1Code}`);

console.log(
  "\n=== Phase 2：fail-closed 路径（E2E-04，强制 compliance resolver 进入既有 catch）===",
);
const phase2Code = run(
  "npx",
  ["playwright", "test", "--grep", "@fail-closed"],
  {
    E2E_HARNESS: "1",
    E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE: "1",
  },
);
console.log(`Phase 2 结束，exit code = ${phase2Code}`);

if (phase1Code !== 0 || phase2Code !== 0) {
  console.error(
    `E2E 失败：Phase 1 exit=${phase1Code}，Phase 2 exit=${phase2Code}`,
  );
  process.exit(phase1Code !== 0 ? phase1Code : phase2Code);
}

console.log("\n=== E2E 全部通过（Phase 1 + Phase 2）===");
process.exit(0);
