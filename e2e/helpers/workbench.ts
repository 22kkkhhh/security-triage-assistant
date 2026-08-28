import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const WORKSPACE_VIEWS: Record<string, string> = {
  概览: "overview",
  调查: "investigation",
  分析: "analysis",
  记录: "records",
};

/** 通过真实工作区标签切换，保留 URL 视图状态。 */
export async function goToWorkspace(page: Page, label: keyof typeof WORKSPACE_VIEWS): Promise<void> {
  await page.getByTestId("case-investigation-nav").getByRole("tab", { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]view=${WORKSPACE_VIEWS[label]}(?:&|$)`));
}

/** 展开历史线索 details（compact → full Signals / Leads / Related） */
export async function expandHistoricalLeads(page: Page): Promise<void> {
  await goToWorkspace(page, "调查");
  const panel = page.getByTestId("related-cases-panel");
  await expect(panel).toBeVisible();
  const details = panel.getByTestId("historical-leads-details");
  if ((await details.count()) === 0) {
    return;
  }
  if (!(await details.getAttribute("open"))) {
    await panel.getByTestId("historical-leads-expand").click();
  }
  await expect(details).toHaveAttribute("open", "");
}
