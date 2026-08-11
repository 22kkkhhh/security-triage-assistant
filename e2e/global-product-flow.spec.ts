import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { expandHistoricalLeads } from "./helpers/workbench";

/**
 * v1.10-M2：跨页面产品流烟测（不重复专项业务 E2E）。
 * Cases → 搜索 → 打开案件 → 对比 → 返回 → 报告入口可见
 * 以及 New Case 3 步 presentation。
 */

const CASE_B_ID = "demo-case-b";

test("全局产品流：列表搜索 → 案件 → 对比 → 返回 → 报告入口", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto("/cases");

  await expect(page.getByRole("heading", { name: "案件队列" })).toBeVisible();
  await expect(page.getByTestId("case-list-filters")).toBeVisible();

  await page.locator('input[name="q"]').fill("INC-20260808-002");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page).toHaveURL(/q=INC-20260808-002/);

  await page
    .getByRole("link", { name: /INC-20260808-002/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_B_ID}$`));
  await expect(page.getByTestId("case-next-step")).toBeVisible();

  await expandHistoricalLeads(page);
  const compareLink = page.getByTestId("related-case-compare-link").first();
  await expect(compareLink).toBeVisible();
  await compareLink.click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_B_ID}/compare/`));
  await expect(page.getByTestId("compare-shared-facts")).toBeVisible();
  await expect(page.getByRole("heading", { name: /共同事实/ })).toBeVisible();

  await page.getByTestId("compare-back-to-current").click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_B_ID}$`));

  await expect(
    page.getByRole("button", { name: /报告/ }).first(),
  ).toBeVisible();
});

test("新建研判：3 步指示与导入方式可选", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto("/cases/new");

  await expect(page.getByRole("heading", { name: "新建研判" })).toBeVisible();
  await expect(page.getByTestId("intake-step-indicator")).toContainText(
    "选择来源",
  );
  await expect(page.getByRole("tab", { name: "手工录入" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "CSV 导入" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "JSON 导入" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "文本粘贴" })).toBeVisible();

  await page.getByRole("tab", { name: "手工录入" }).click();
  await expect(page.getByTestId("intake-step-indicator")).toContainText(
    "提供告警",
  );
  await expect(
    page.getByRole("heading", { name: "2 提供告警" }),
  ).toBeVisible();
});
