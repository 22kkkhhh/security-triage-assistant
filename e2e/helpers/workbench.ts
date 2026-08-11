import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** 展开历史线索 details（compact → full Signals / Leads / Related） */
export async function expandHistoricalLeads(page: Page): Promise<void> {
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
