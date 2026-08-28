import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { expandHistoricalLeads, goToWorkspace } from "./helpers/workbench";

/**
 * v1.10-M1：Workbench IA — 高价值任务流。
 */

const CASE_B_ID = "demo-case-b";

test("Analyst：Next Step → 调查 → Checklist → 历史线索 opt-in → 分析 → HumanReview", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  await expect(page.getByTestId("investigation-overview")).toBeVisible();
  await expect(page.getByTestId("investigation-next-actions")).toBeVisible();

  const nav = page.getByTestId("case-investigation-nav");
  for (const label of ["概览", "调查", "分析", "记录"]) {
    await expect(nav.getByRole("tab", { name: label })).toBeVisible();
  }

  await page.getByTestId("investigation-next-actions").getByRole("button", { name: "开始调查" }).click();
  await expect(page).toHaveURL(/view=investigation/);
  await expect(page.locator("#investigation-business-context")).toBeVisible();
  const allChecklistItems = page.getByTestId("evidence-checklist-workspace").getByRole("tab", { name: /全部/ });
  if (await allChecklistItems.count()) await allChecklistItems.click();
  const showMoreChecklistItems = page.getByTestId("evidence-checklist-workspace").getByRole("button", { name: /查看全部/ });
  if (await showMoreChecklistItems.count()) await showMoreChecklistItems.click();

  const pendingBox = page.locator('#investigation-checklist input[type="checkbox"]:not(:checked)').first();
  await expect(pendingBox).toBeVisible();
  const pendingLabel = await pendingBox.getAttribute("aria-label");
  expect(pendingLabel).toBeTruthy();
  await pendingBox.evaluate((element) => (element as HTMLInputElement).click());
  await expect(page.getByText("处理中…")).toHaveCount(0, { timeout: 10_000 });
  const completedLabel = pendingLabel!.replace("（未完成）", "（已完成）");
  await expect(page.getByLabel(completedLabel)).toBeChecked();

  await expandHistoricalLeads(page);
  const lead = page.locator(
    '[data-testid="investigation-lead-item"][data-lead-code="COMPARE_SHARED_SYSTEM_ACTIVITY"]',
  );
  await expect(lead).toBeVisible();
  const addBtn = lead.getByTestId("investigation-lead-add-button");
  if (await addBtn.count()) {
    await addBtn.click();
  }
  await expect(lead.getByTestId("investigation-lead-added")).toBeVisible({
    timeout: 15_000,
  });

  await goToWorkspace(page, "分析");
  const analysis = page.getByTestId("system-analysis-details");
  await expect(analysis).toBeVisible();
  if (!(await analysis.getAttribute("open"))) {
    await analysis.locator("summary").click();
  }
  await expect(analysis).toHaveAttribute("open", "");

  await goToWorkspace(page, "调查");
  await expect(page.getByLabel("最终结论")).toBeVisible();
  await page.getByLabel("最终结论").selectOption({ label: "暂无法定论" });
  await expect(page.getByText("处理中…")).toHaveCount(0, { timeout: 10_000 });
});

test("Viewer：四主导航可见，历史线索可展开，无可写控件", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.viewer);
  await page.goto(`/cases/${CASE_B_ID}`);

  const nav = page.getByTestId("case-investigation-nav");
  for (const label of ["概览", "调查", "分析", "记录"]) {
    await expect(nav.getByRole("tab", { name: label })).toBeVisible();
  }

  await expandHistoricalLeads(page);
  await expect(page.getByTestId("related-cases-panel")).toBeVisible();
  await expect(
    page.getByTestId("investigation-lead-add-button"),
  ).toHaveCount(0);

  await expect(page.getByText("只读模式").first()).toBeVisible();
  await expect(
    page.locator('#investigation-checklist input[type="checkbox"]'),
  ).toHaveCount(0);
});
