import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.9-M1：Comparative Investigation Workspace。
 * Demo A/B 共享 CRM_PROD → 可从历史线索进入对比页。
 */

const CASE_A_ID = "demo-case-a";
const CASE_B_ID = "demo-case-b";
const CASE_A_NUMBER = "INC-20260808-001";
const CASE_B_NUMBER = "INC-20260808-002";

test("对比调查：共享事实可见，返回后当前研判不被改写", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  const panel = page.getByTestId("related-cases-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("related-case-compare-link").first()).toBeVisible();

  const suggestedBefore = (
    await page.getByTestId("suggested-assessment-bar").innerText()
  ).trim();
  const conclusionBefore = await page.getByLabel("最终结论").inputValue();
  const humanRiskBefore = await page.getByLabel("人工风险等级").inputValue();

  await panel.getByTestId("related-case-compare-link").first().click();
  await expect(page).toHaveURL(
    new RegExp(`/cases/${CASE_B_ID}/compare/${CASE_A_ID}$`),
  );

  const compare = page.getByTestId("case-comparison-panel");
  await expect(compare).toBeVisible();
  await expect(page.getByRole("heading", { name: "案件对比调查" })).toBeVisible();
  await expect(compare.getByTestId("compare-safety-disclaimer")).toContainText(
    "不表示两个案件属于同一安全事件",
  );
  await expect(compare.getByTestId("compare-current-column")).toContainText(
    CASE_B_NUMBER,
  );
  await expect(compare.getByTestId("compare-historical-column")).toContainText(
    CASE_A_NUMBER,
  );
  await expect(compare.getByTestId("compare-current-column")).toContainText(
    "当前案件",
  );
  await expect(compare.getByTestId("compare-historical-column")).toContainText(
    "历史案件",
  );
  await expect(compare.getByTestId("compare-shared-facts")).toContainText(
    "CRM_PROD",
  );
  await expect(
    compare.getByTestId("compare-history-review-warning"),
  ).toContainText("不自动继承");

  await page.getByTestId("compare-back-to-current").click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_B_ID}$`));

  const suggestedAfter = (
    await page.getByTestId("suggested-assessment-bar").innerText()
  ).trim();
  expect(suggestedAfter).toBe(suggestedBefore);
  await expect(page.getByLabel("最终结论")).toHaveValue(conclusionBefore);
  await expect(page.getByLabel("人工风险等级")).toHaveValue(humanRiskBefore);

  await expect(page.getByTestId("related-cases-panel")).not.toContainText(
    "同一攻击者",
  );
});
