import { expect, test } from "@playwright/test";

/**
 * v1.6-M1 Playwright Foundation smoke：只证明基础设施可用。
 * 真实登录表单（不 mock Better Auth）→ demo-analyst → 进入 authenticated /cases。
 * 密码从 scripts/run-e2e.ts 注入的 test-only env 读取，不在此重复硬编码。
 * 后续 E2E-01/02/03/04 属于其他任务，本文件不展开。
 */

const DEMO_ANALYST_USERNAME = "demo-analyst";

test("demo-analyst 可通过真实登录表单进入 authenticated app", async ({ page }) => {
  const password = process.env.DEMO_AUTH_PASSWORD;
  if (!password) {
    throw new Error(
      "DEMO_AUTH_PASSWORD 未注入；请通过 npm run test:e2e（scripts/run-e2e.ts）运行本测试。",
    );
  }

  await page.goto("/login");

  await page.getByLabel("用户名").fill(DEMO_ANALYST_USERNAME);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/cases$/);
  await expect(
    page.getByRole("heading", { name: "历史案件" }),
  ).toBeVisible();
});
