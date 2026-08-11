import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.6-M1 Playwright Foundation smoke：只证明基础设施可用。
 * 真实登录表单（不 mock Better Auth）→ demo-analyst → 进入 authenticated /cases。
 * 密码从 scripts/run-e2e.ts 注入的 test-only env 读取，不在此重复硬编码。
 * 后续 E2E-01/02/03/04 属于其他任务，本文件不展开。
 */

test("demo-analyst 可通过真实登录表单进入 authenticated app", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await expect(
    page.getByRole("heading", { name: "案件队列" }),
  ).toBeVisible();
});
