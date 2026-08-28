import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { goToWorkspace } from "./helpers/workbench";

/**
 * v1.6-M2-03：Case 首屏「状态 + 下一步」与调查工作流重排。
 * Case B 通常有 pendingContext → 建议下一步指向业务上下文。
 */

const CASE_B_ID = "demo-case-b";

test("建议下一步、基础信息与系统分析折叠、CTA 可导航", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  const progress = page.getByTestId("investigation-overview");
  const nextActions = page.getByTestId("investigation-next-actions");
  await expect(nextActions).toBeVisible();
  await expect(progress.getByRole("heading", { name: "概览" })).toBeVisible();

  // 案件信息默认关闭（details 内容仍在 DOM，以可见性断言）
  const basic = page.getByTestId("case-basic-info");
  await expect(basic).toBeVisible();
  await expect(basic).not.toHaveAttribute("open");
  await expect(basic.getByText("告警来源")).toBeHidden();
  await basic.locator("summary").click();
  await expect(basic).toHaveAttribute("open", "");
  await expect(basic.getByText("告警来源")).toBeVisible();
  await expect(basic.getByText("告警时间")).toBeVisible();

  // 系统分析详情默认关闭
  await goToWorkspace(page, "分析");
  const analysis = page.getByTestId("system-analysis-details");
  await expect(analysis).toBeVisible();
  await expect(analysis).not.toHaveAttribute("open");
  await expect(
    analysis.getByRole("heading", { name: /异常与待确认行为摘要/ }),
  ).toBeHidden();
  await analysis.locator("summary").click();
  await expect(analysis).toHaveAttribute("open", "");
  await expect(
    analysis.getByRole("heading", { name: /异常与待确认行为摘要/ }),
  ).toBeVisible();

  // CTA 导航到正确调查 section（Case B：补充业务上下文）
  await goToWorkspace(page, "概览");
  await expect(nextActions.getByText("补充业务上下文")).toBeVisible();
  await nextActions.getByRole("button", { name: /补充业务上下文/ }).click();
  const businessContext = page.locator("#investigation-business-context");
  await expect(businessContext).toBeInViewport({ timeout: 5_000 });
});
