import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

const CASE_B_ID = "demo-case-b";

/** 构造「今天稍后」的 datetime-local（按项目 UTC+8 墙钟语义） */
function laterTodayUtc8FormValue(): string {
  const now = new Date();
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = String(cn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cn.getUTCDate()).padStart(2, "0");
  let h = cn.getUTCHours() + 2;
  if (h > 23) h = 23;
  // Keep the target safely in the future when the current UTC+8 hour is late.
  if (h === 23) return `${y}-${m}-${d}T23:59`;
  const hh = String(h).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:00`;
}

/**
 * v1.11 M2：Operational Due Date 高价值路径。
 * 不重复完整调查 E2E。
 */
test.describe("Case Due Date & Queue Prioritization", () => {
  test("Analyst：接手 → 设置今日截止 → 我的+截止优先 → 清除", async ({
    page,
  }) => {
    await loginAsDemoUser(page, DEMO_USERS.analyst);

    await page.goto(`/cases/${CASE_B_ID}`);
    await expect(page.getByTestId("case-ownership")).toBeVisible();

    // 确保自己负责（可能被上轮 E2E 污染）
    const claim = page.getByTestId("case-ownership-claim");
    if (await claim.count()) {
      await claim.click();
      await expect(page.getByTestId("case-ownership-label")).toContainText("我");
    }

    await expect(page.getByTestId("case-due-date-input")).toBeVisible();
    const formValue = laterTodayUtc8FormValue();
    await page.getByTestId("case-due-date-input").fill(formValue);
    await page.getByTestId("case-due-date-update").click();
    await expect(page.getByTestId("case-due-date-label")).toContainText(/今日/);

    await page.reload();
    await expect(page.getByTestId("case-due-date-label")).toContainText(/今日/);

    await page.goto("/cases?scope=mine&sort=due");
    await expect(page).toHaveURL(/scope=mine/);
    await expect(page).toHaveURL(/sort=due/);
    const row = page
      .getByTestId("case-list-row")
      .filter({ hasText: "INC-20260808-002" });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("case-list-due")).toContainText(/今日到期|今日/);

    await page.goto(`/cases/${CASE_B_ID}`);
    await page.getByTestId("case-due-date-clear").click();
    await expect(page.getByTestId("case-due-date-label")).toContainText(
      "未设置截止时间",
    );

    // 释放负责人，避免污染后续 Ownership E2E
    const release = page.getByTestId("case-ownership-release");
    if (await release.count()) {
      await release.click();
      await expect(page.getByTestId("case-ownership-label")).toContainText(
        "未分配",
      );
    }
  });

  test("Admin：他人负责 Case 可设置截止；Activity 可见", async ({ page }) => {
    await loginAsDemoUser(page, DEMO_USERS.admin);

    await page.goto(`/cases/${CASE_B_ID}`);
    const select = page.getByTestId("case-ownership-admin-select");
    await expect(select).toBeVisible();
    const analystOption = select.locator("option", { hasText: "演示分析员" });
    const analystId = await analystOption.getAttribute("value");
    expect(analystId).toBeTruthy();
    await select.selectOption(analystId!);

    await expect(page.getByTestId("case-due-date-input")).toBeVisible();
    const formValue = laterTodayUtc8FormValue();
    await page.getByTestId("case-due-date-input").fill(formValue);
    await page.getByTestId("case-due-date-update").click();
    await expect(page.getByTestId("case-due-date-label")).toContainText(/今日|截止|已逾期/);

    await page.getByTestId("activity-details").locator("summary").click();
    await expect(page.getByText(/截止时间/).first()).toBeVisible({
      timeout: 10_000,
    });

    // 清理：清除截止并释放，避免污染后续用例
    await page.getByTestId("case-due-date-clear").click();
    await select.selectOption("");
    await expect(page.getByTestId("case-ownership-admin-select")).toHaveValue(
      "",
    );
  });

  test("Viewer：可见截止，无写控件", async ({ page }) => {
    await loginAsDemoUser(page, DEMO_USERS.viewer);

    await page.goto(`/cases/${CASE_B_ID}`);
    await expect(page.getByTestId("case-due-date")).toBeVisible();
    await expect(page.getByTestId("case-due-date-label")).toBeVisible();
    await expect(page.getByTestId("case-due-date-input")).toHaveCount(0);
    await expect(page.getByTestId("case-due-date-update")).toHaveCount(0);
    await expect(page.getByTestId("case-due-date-clear")).toHaveCount(0);
  });
});
