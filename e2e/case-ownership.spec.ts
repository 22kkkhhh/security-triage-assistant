import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

const CASE_B_ID = "demo-case-b";

/**
 * v1.11 M1：Case Ownership / My Queue 高价值路径。
 * 不重复完整调查 E2E。
 */
test.describe("Case Ownership & My Queue", () => {
  test("Analyst：未分配接手 → 我的 → 释放 → 未分配", async ({ page }) => {
    await loginAsDemoUser(page, DEMO_USERS.analyst);

    await expect(page.getByRole("heading", { name: "案件队列" })).toBeVisible();
    await page.getByTestId("case-queue-scope-unassigned").click();
    await expect(page).toHaveURL(/scope=unassigned/);

    await page.goto(`/cases/${CASE_B_ID}`);
    await expect(page.getByTestId("case-ownership")).toBeVisible();
    await expect(page.getByTestId("case-ownership-label")).toContainText("未分配");

    await page.getByTestId("case-ownership-claim").click();
    await expect(page.getByTestId("case-ownership-label")).toContainText("我");

    await page.reload();
    await expect(page.getByTestId("case-ownership-label")).toContainText("我");

    await page.goto("/cases?scope=mine");
    await expect(page.getByTestId("case-list-row").filter({ hasText: "INC-20260808-002" })).toBeVisible();

    await page.goto(`/cases/${CASE_B_ID}`);
    await page.getByTestId("case-ownership-release").click();
    await expect(page.getByTestId("case-ownership-label")).toContainText("未分配");

    await page.goto("/cases?scope=mine");
    await expect(
      page.getByTestId("case-list-row").filter({ hasText: "INC-20260808-002" }),
    ).toHaveCount(0);

    await page.goto("/cases?scope=unassigned");
    await expect(
      page.getByTestId("case-list-row").filter({ hasText: "INC-20260808-002" }),
    ).toBeVisible();
  });

  test("Admin：指派 Analyst 后 Activity 出现分配记录", async ({ page }) => {
    await loginAsDemoUser(page, DEMO_USERS.admin);

    await page.goto(`/cases/${CASE_B_ID}`);
    await expect(page.getByTestId("case-ownership-admin-select")).toBeVisible();

    const select = page.getByTestId("case-ownership-admin-select");
    const analystOption = select.locator("option", { hasText: "演示分析员" });
    const analystId = await analystOption.getAttribute("value");
    expect(analystId).toBeTruthy();
    await select.selectOption(analystId!);

    await expect(select).toHaveValue(analystId!);

    // Activity 默认折叠：展开后可见分配审计
    await page.getByTestId("activity-details").locator("summary").click();
    await expect(
      page.getByText(/接手了案件|分配给|案件负责人|调整为/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Viewer：可见负责人，无写控件；无我的/未分配 scope", async ({ page }) => {
    await loginAsDemoUser(page, DEMO_USERS.viewer);

    await expect(page.getByRole("heading", { name: "案件队列" })).toBeVisible();
    await expect(page.getByTestId("case-queue-scopes")).toHaveCount(0);
    await expect(page.getByTestId("case-list-owner").first()).toBeVisible();

    await page.goto(`/cases/${CASE_B_ID}`);
    await expect(page.getByTestId("case-ownership")).toBeVisible();
    await expect(page.getByTestId("case-ownership-claim")).toHaveCount(0);
    await expect(page.getByTestId("case-ownership-release")).toHaveCount(0);
    await expect(page.getByTestId("case-ownership-admin-select")).toHaveCount(0);
  });
});
