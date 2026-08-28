import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { expandHistoricalLeads, goToWorkspace } from "./helpers/workbench";

/**
 * v1.8-M2：Historical Signals + Investigation Leads。
 * Demo Case A/B 因 CRM_PROD 重叠可互相关联；不污染正式 Demo seed。
 */

const CASE_A_ID = "demo-case-a";
const CASE_B_ID = "demo-case-b";
const CASE_A_NUMBER = "INC-20260808-001";

test("历史调查线索：Signals / Leads 可见，关联可点，风险与 HumanReview 不被自动修改", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);
  await goToWorkspace(page, "调查");

  const panel = page.getByTestId("related-cases-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "历史线索" })).toBeVisible();

  // 主导航收敛为「调查」；历史线索在调查内部
  const nav = page.getByTestId("case-investigation-nav");
  await expect(nav.getByRole("tab", { name: "调查" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "历史线索" })).toHaveCount(0);

  await expandHistoricalLeads(page);

  // Demo A/B 共享 CRM_PROD → related + RECURRING_SYSTEM signal + system lead
  await expect(panel.getByTestId("historical-related-count")).toContainText(
    "相关",
  );
  await expect(panel.getByTestId("historical-signals")).toBeVisible();
  await expect(
    panel.locator('[data-signal-code="RECURRING_SYSTEM"]'),
  ).toContainText("CRM_PROD");
  await expect(panel.getByTestId("investigation-leads")).toBeVisible();
  await expect(
    panel.locator('[data-lead-code="COMPARE_SHARED_SYSTEM_ACTIVITY"]'),
  ).toBeVisible();

  await expect(panel.getByTestId("related-cases-list")).toBeVisible();
  await expect(panel.getByTestId("related-cases-empty")).toHaveCount(0);
  await expect(panel.getByText(CASE_A_NUMBER)).toBeVisible();

  // 记录当前 Suggested Risk / HumanReview，确认 intelligence 未改写
  await goToWorkspace(page, "分析");
  const suggestedBar = page.getByTestId("suggested-assessment-bar");
  await expect(suggestedBar).toBeVisible();
  const suggestedBefore = (await suggestedBar.innerText()).trim();

  await goToWorkspace(page, "调查");
  const finalConclusion = page.getByLabel("最终结论");
  const humanRisk = page.getByLabel("人工风险等级");
  const conclusionBefore = await finalConclusion.inputValue();
  const humanRiskBefore = await humanRisk.inputValue();

  await panel.getByTestId("related-case-link").first().click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_A_ID}$`));
  await expect(page.getByText(CASE_A_NUMBER).first()).toBeVisible();
  await goToWorkspace(page, "调查");
  await expect(page.getByTestId("related-cases-panel")).toBeVisible();

  // 回到 Case B，Suggested / HumanReview 仍未被自动修改
  await page.goto(`/cases/${CASE_B_ID}`);
  await goToWorkspace(page, "分析");
  const suggestedAfter = (
    await page.getByTestId("suggested-assessment-bar").innerText()
  ).trim();
  // innerText 空白可能随折叠/重排/块级节点拼接变化；比对时去掉全部空白
  const collapseWs = (value: string) => value.replace(/\s+/g, "").trim();
  expect(collapseWs(suggestedAfter)).toBe(collapseWs(suggestedBefore));
  await goToWorkspace(page, "调查");
  await expect(page.getByLabel("最终结论")).toHaveValue(conclusionBefore);
  await expect(page.getByLabel("人工风险等级")).toHaveValue(humanRiskBefore);

  // 禁止结论性文案
  await expect(page.getByTestId("related-cases-panel")).not.toContainText(
    "已确认重复攻击",
  );
  await expect(page.getByTestId("related-cases-panel")).not.toContainText(
    "同一攻击者",
  );
});
