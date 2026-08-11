import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.9-M2：Investigation Lead opt-in → Checklist。
 * Demo Case B 对 A 有 SHARED_SYSTEM → COMPARE_SHARED_SYSTEM_ACTIVITY lead。
 */

const CASE_B_ID = "demo-case-b";
const LEAD_CHECKLIST_LABEL =
  "对比关联案件在共同业务系统中的访问时间、操作范围与上下文";

test("历史线索加入核查清单：持久化、badge、完成/重开，不改研判", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  const lead = page.locator(
    '[data-testid="investigation-lead-item"][data-lead-code="COMPARE_SHARED_SYSTEM_ACTIVITY"]',
  );
  await expect(lead).toBeVisible();

  const suggestedBefore = (
    await page.getByTestId("suggested-assessment-bar").innerText()
  ).trim();
  const conclusionBefore = await page.getByLabel("最终结论").inputValue();
  const humanRiskBefore = await page.getByLabel("人工风险等级").inputValue();

  await lead.getByTestId("investigation-lead-add-button").click();
  await expect(lead.getByTestId("investigation-lead-added")).toBeVisible({
    timeout: 15_000,
  });

  const checklist = page.getByTestId("evidence-checklist-workspace");
  await expect(
    checklist.getByTestId("checklist-badge-investigation-lead").first(),
  ).toBeVisible();
  await expect(checklist.getByText("历史线索").first()).toBeVisible();
  await expect(
    checklist.getByText(LEAD_CHECKLIST_LABEL, { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page
      .locator(
        '[data-testid="investigation-lead-item"][data-lead-code="COMPARE_SHARED_SYSTEM_ACTIVITY"]',
      )
      .getByTestId("investigation-lead-added"),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("evidence-checklist-workspace")
      .getByTestId("checklist-badge-investigation-lead")
      .first(),
  ).toBeVisible();

  // complete then reopen via checklist checkbox
  const row = page
    .getByTestId("evidence-checklist-workspace")
    .getByText(LEAD_CHECKLIST_LABEL, { exact: true })
    .locator("xpath=ancestor::li[1]");
  const checkbox = row.getByRole("checkbox");
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();

  const suggestedAfter = (
    await page.getByTestId("suggested-assessment-bar").innerText()
  ).trim();
  expect(suggestedAfter).toBe(suggestedBefore);
  await expect(page.getByLabel("最终结论")).toHaveValue(conclusionBefore);
  await expect(page.getByLabel("人工风险等级")).toHaveValue(humanRiskBefore);
});
