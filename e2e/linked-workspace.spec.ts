import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { expandHistoricalLeads, goToWorkspace } from "./helpers/workbench";

test("Analyst：实体、证据和关联调查保持当前案件上下文", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto("/cases/demo-case-b");

  await expect(page.getByTestId("investigation-next-actions")).toBeVisible();
  await page.getByRole("button", { name: "账号 · demo_user_07" }).first().click();
  const accountDrawer = page.getByRole("complementary", { name: "账号调查" });
  await expect(accountDrawer).toContainText("历史事实");
  await expect(accountDrawer).toContainText("出现次数");
  await accountDrawer.getByRole("button", { name: "关闭实体面板" }).click();

  await goToWorkspace(page, "调查");
  await page.getByText(/查看系统证据/).click();
  await expect(page.getByRole("heading", { name: /证据中心/ })).toBeVisible();
  await page.getByRole("button", { name: "标记为关键证据" }).first().click();
  await expect(page.getByRole("button", { name: "取消关键证据" })).toBeVisible();
  await page.reload();
  await page.getByText(/查看系统证据/).click();
  await expect(page.getByRole("button", { name: "取消关键证据" })).toBeVisible();
  await expect(page.getByTestId("human-review-key-evidence-context")).toBeVisible();

  await goToWorkspace(page, "概览");
  await page.getByRole("button", { name: "IP · 172.16.8.23" }).last().click();
  await expect(page.getByRole("complementary", { name: "IP调查" })).toContainText(
    "历史事实",
  );
  await page.getByRole("button", { name: "关闭实体面板" }).first().click();

  await expandHistoricalLeads(page);
  await expect(page.getByTestId("related-cases-panel")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "对比调查" }).first(),
  ).toBeVisible();
});
