import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.8-M1：Related Cases 区稳定展示；Demo Case A/B 因 CRM_PROD 重叠可互相关联。
 */

const CASE_A_ID = "demo-case-a";
const CASE_B_ID = "demo-case-b";
const CASE_A_NUMBER = "INC-20260808-001";

test("Case Workbench 展示关联历史案件并可进入目标 Case", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  const panel = page.getByTestId("related-cases-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "关联历史案件" })).toBeVisible();

  // Demo A/B 共享 CRM_PROD → 应出现关联，而非 empty
  await expect(panel.getByTestId("related-cases-list")).toBeVisible();
  await expect(panel.getByTestId("related-cases-empty")).toHaveCount(0);
  await expect(panel.getByText(CASE_A_NUMBER)).toBeVisible();
  await expect(panel.getByText("重叠业务系统")).toBeVisible();
  await expect(panel.getByText("CRM_PROD")).toBeVisible();

  await panel.getByTestId("related-case-link").first().click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_A_ID}$`));
  await expect(page.getByText(CASE_A_NUMBER).first()).toBeVisible();

  // 目标 Case 侧也有 Related Cases 区（至少稳定渲染）
  await expect(page.getByTestId("related-cases-panel")).toBeVisible();
});
