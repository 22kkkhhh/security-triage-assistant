import { defineConfig, devices } from "@playwright/test";

/**
 * v1.6-M1 Playwright Foundation：最小浏览器 E2E 基础设施。
 *
 * - 固定运行在 next dev（非 next start），端口 3100，避免占用开发者常用 3000。
 * - reuseExistingServer=false：避免误连接开发者本机已在跑、使用 dev.db 的服务。
 * - 仅 Chromium；workers=1 / fullyParallel=false，避免 SQLite 单实例并发问题。
 * - 本文件不直接负责 E2E 专用环境变量与 db:reset-demo；由 scripts/run-e2e.ts 统一注入。
 */
const HOST = "127.0.0.1";
const PORT = 3100;
const baseURL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname ${HOST} --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
