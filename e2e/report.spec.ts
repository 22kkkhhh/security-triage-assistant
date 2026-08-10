import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.6-M1 E2E-02 — Report Edit / Persist / DOCX Export。
 *
 * demo-analyst 登录 → demo-case-a（已有 report，非首次生成）
 * → 通过真实 UI 入口「继续编辑报告」进入 Report Editor
 * → 编辑「事件名称」并等待真实 Report autosave 完成
 * → page.reload() → 编辑内容仍存在（证明来自 server persisted reportDraft）
 * → 点击「导出 Word」→ 根据实际敏感信息检测结果确认导出（不测试「保持原值导出」分支）
 * → 用 page.waitForEvent("download") 验证真实浏览器下载，并做最小 DOCX/ZIP 有效性校验。
 *
 * 选择字段说明：「事件名称」是报告编辑器中唯一独立 Panel 内的 input（其余字段均为
 * textarea），按任务要求优先定位 heading "事件名称" 所属 section，再 scope 到其
 * 内部 input，避免使用索引/nth 选择器。
 */

const CASE_A_ID = "demo-case-a";
const CASE_A_NUMBER = "INC-20260808-001";

const SAVED_TEXT = /^已保存/;
const SAVING_OR_DIRTY_TEXT = /待保存…|保存中…/;

async function expectNoReportFailureVisible(page: Page): Promise<void> {
  await expect(page.getByText("保存失败")).toHaveCount(0);
  await expect(page.getByText("报告已在其他页面发生更新")).toHaveCount(0);
}

/** 等待一次 Report autosave 真实走完：先出现 dirty/saving，再出现已保存，且无失败。 */
async function waitForReportSaveRoundTrip(page: Page): Promise<void> {
  await expect(page.getByText(SAVING_OR_DIRTY_TEXT).first()).toBeVisible();
  await expect(page.getByText(SAVED_TEXT).first()).toBeVisible({
    timeout: 10_000,
  });
  await expectNoReportFailureVisible(page);
}

function eventNameInput(page: Page) {
  const eventNameSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "事件名称" }) });
  return eventNameSection.locator("input");
}

test("demo-analyst 编辑 demo-case-a 报告并在 reload 后仍真实持久化，可导出有效 DOCX", async ({
  page,
}) => {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const eventNameValue = `E2E Report Persistence ${uniqueId}`;

  await loginAsDemoUser(page, DEMO_USERS.analyst);

  // 1. 通过真实 UI 入口进入已有报告（Case A 已有 report，非首次生成）
  await page.goto(`/cases/${CASE_A_ID}`);
  await page.getByRole("button", { name: "继续编辑报告" }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_A_ID}/report$`));
  await expect(page.getByText(CASE_A_NUMBER).first()).toBeVisible();
  await expect(page.getByText("报告状态：草稿")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出 Word" }),
  ).toBeVisible();

  // 2. 编辑「事件名称」（唯一独立 Panel 内的 input，非 nth 选择）
  await eventNameInput(page).fill(eventNameValue);

  // 3. 等待真实 Report autosave 完成（不使用 waitForTimeout）
  await waitForReportSaveRoundTrip(page);

  // 4. reload persistence：证明数据来自 server persisted reportDraft
  await page.reload();
  await expect(eventNameInput(page)).toHaveValue(eventNameValue);
  await expectNoReportFailureVisible(page);

  // 5. 导出 DOCX：先出现确认弹窗，根据实际检测结果选择「确认导出」或
  //    「使用脱敏版本导出」，不选择「保持原值导出」。
  await page.getByRole("button", { name: "导出 Word" }).click();
  const confirmExportButton = page.getByRole("button", {
    name: /^(确认导出|使用脱敏版本导出)$/,
  });
  await expect(confirmExportButton).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await confirmExportButton.click();
  const download = await downloadPromise;

  // 6. 下载验收：不解析 DOCX 正文，只做最小有效性校验。
  const suggestedFilename = download.suggestedFilename();
  expect(suggestedFilename.endsWith(".docx")).toBe(true);

  const savedDir = path.join(process.cwd(), "test-results", "e2e-downloads");
  fs.mkdirSync(savedDir, { recursive: true });
  const savedPath = path.join(savedDir, `${uniqueId}-${suggestedFilename}`);
  await download.saveAs(savedPath);

  const stat = fs.statSync(savedPath);
  expect(stat.size).toBeGreaterThan(0);

  const headerBytes = Buffer.alloc(2);
  const fd = fs.openSync(savedPath, "r");
  fs.readSync(fd, headerBytes, 0, 2, 0);
  fs.closeSync(fd);
  expect(headerBytes[0]).toBe(0x50); // "P"
  expect(headerBytes[1]).toBe(0x4b); // "K" — DOCX 本质是 ZIP

  fs.rmSync(savedPath, { force: true });

  await expectNoReportFailureVisible(page);
});
