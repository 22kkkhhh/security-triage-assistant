import { expect, type Page } from "@playwright/test";

/**
 * E2E 固定 Demo 账号；密码统一从 scripts/run-e2e.ts 注入的 test-only env 读取，
 * 不在测试代码中重复硬编码明文密码。
 */
export const DEMO_USERS = {
  analyst: "demo-analyst",
  viewer: "demo-viewer",
} as const;

export function getDemoAuthPassword(): string {
  const password = process.env.DEMO_AUTH_PASSWORD;
  if (!password) {
    throw new Error(
      "DEMO_AUTH_PASSWORD 未注入；请通过 npm run test:e2e（scripts/run-e2e.ts）运行本测试。",
    );
  }
  return password;
}

/**
 * 通过真实登录表单登录（不 mock Better Auth），并等待跳转到 authenticated /cases。
 */
export async function loginAsDemoUser(
  page: Page,
  username: string,
): Promise<void> {
  const password = getDemoAuthPassword();

  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/cases$/);
}
