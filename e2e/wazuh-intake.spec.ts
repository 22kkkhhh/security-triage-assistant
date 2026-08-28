import path from "node:path";
import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { goToWorkspace } from "./helpers/workbench";

/**
 * v1.7-M4：Wazuh JSON 导入 → preview → 人工确认 → 创建 Case → Workbench。
 * 使用脱敏虚构 fixture；不编造认证失败次数等上下文。
 */

const FIXTURE = path.resolve(
  import.meta.dirname,
  "fixtures/wazuh-auth-alert.json",
);

test("Wazuh JSON 导入可 preview、确认并创建 Case", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto("/cases/new");

  await page.getByRole("tab", { name: "JSON 导入" }).click();
  await page.getByTestId("import-source-type").selectOption("WAZUH");
  await expect(page.getByTestId("wazuh-import-hint")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);

  await expect(page.getByRole("heading", { name: "确认导入内容" })).toBeVisible();

  await expect(page.getByLabel(/外部告警 ID/)).toHaveValue(
    "wazuh-e2e-1712345678.424242",
  );
  await expect(page.getByLabel(/告警时间/)).toHaveValue(
    "2026-08-10T04:22:11.000Z",
  );
  await expect(page.getByLabel(/告警名称/)).toHaveValue(
    "sshd: authentication failed from example network",
  );
  await expect(page.getByLabel(/原始告警级别/)).toHaveValue("HIGH");
  await expect(page.getByLabel(/源 IP/)).toHaveValue("198.51.100.77");
  await expect(page.getByLabel(/^账号/)).toHaveValue("demo_lab_user");
  await expect(page.getByLabel(/目的 IP/)).toHaveValue("10.0.0.42");
  await expect(page.getByLabel(/目的端口/)).toHaveValue("22");

  const unrecognized = page.getByText("未识别内容", { exact: false });
  await expect(unrecognized).toBeVisible();
  await expect(page.getByText("rule.id", { exact: false })).toBeVisible();
  await expect(page.getByText("agent.name", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "创建研判案件" }).click();
  await expect(page).toHaveURL(/\/cases\/[^/]+$/, { timeout: 15_000 });

  const basic = page.getByTestId("case-basic-info");
  await basic.locator("summary").click();
  await expect(basic.getByText("告警来源")).toBeVisible();
  await expect(basic.getByText("Wazuh", { exact: true })).toBeVisible();

  // 缺上下文不得伪装为 NORMAL；UI 以中文三态展示 UNKNOWN
  await goToWorkspace(page, "分析");
  await page.getByTestId("system-analysis-details").locator("summary").click();
  await expect(
    page.getByText("数据不足，暂无法判断").first(),
  ).toBeVisible();
});
