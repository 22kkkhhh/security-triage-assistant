import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { goToWorkspace } from "./helpers/workbench";

/**
 * v1.6-M2-01：SYSTEM checklist 展示分组。
 * 不改变 item.id / completion 语义；只验证 UI 去重复感与单 child 独立操作。
 */

const CASE_B_ID = "demo-case-b";
const GROUP_LABEL = "联系业务负责人";

function checklistSection(page: Page) {
  return page
    .getByRole("heading", { name: /^待核查事项/ })
    .locator("xpath=ancestor::section[1]");
}

test("SYSTEM 同 label 折叠为 group；展开后单 child 独立完成", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);
  await goToWorkspace(page, "调查");
  const allChecklistItems = page.getByRole("tab", { name: /全部/ });
  if (await allChecklistItems.count()) await allChecklistItems.click();
  const showMoreChecklistItems = page.getByRole("button", { name: /查看全部/ });
  if (await showMoreChecklistItems.count()) await showMoreChecklistItems.click();

  const section = checklistSection(page);
  await expect(section).toBeVisible();

  // collapsed：主 label 出现在 group summary；不刷屏多个完整 row 的备注框
  const groupRow = section
    .locator("li")
    .filter({ hasText: "系统核查 ·" })
    .filter({ hasText: GROUP_LABEL })
    .first();
  await expect(groupRow).toBeVisible();
  await expect(groupRow.getByText(/系统核查 · \d+ 项/)).toBeVisible();
  await expect(groupRow.getByText(/\d+ \/ \d+ 已完成/)).toBeVisible();

  // collapsed 时该 group 内不应出现备注输入（child 未展开）
  await expect(groupRow.locator('input[placeholder="备注（可编辑）"]')).toHaveCount(
    0,
  );

  // 展开一个 group
  await groupRow.getByRole("button", { name: "展开明细" }).click();
  const childCheckboxes = groupRow.locator('input[type="checkbox"]');
  const childCount = await childCheckboxes.count();
  expect(childCount).toBeGreaterThanOrEqual(2);

  // 定位第一个未完成 child（按索引稳定，避免 aria-label 更新后 locator 漂移）
  let targetIndex = -1;
  for (let i = 0; i < childCount; i += 1) {
    const label = (await childCheckboxes.nth(i).getAttribute("aria-label")) ?? "";
    if (label.includes("未完成")) {
      targetIndex = i;
      break;
    }
  }
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const first = page.getByLabel(`${GROUP_LABEL}（未完成）`).first();
  expect((await first.getAttribute("aria-label")) ?? "").toContain(GROUP_LABEL);

  await first.evaluate((element) => (element as HTMLInputElement).click());
  await expect(page.getByText("处理中…")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("保存失败")).toHaveCount(0);
  const completed = page.getByLabel(`${GROUP_LABEL}（已完成）`).first();
  await expect(completed).toBeChecked();
  await expect(completed).toHaveAttribute("aria-label", `${GROUP_LABEL}（已完成）`);

  // 同 group 其它 child 不得被批量完成
  for (let i = 0; i < childCount; i += 1) {
    if (i === targetIndex) continue;
    await expect(childCheckboxes.nth(i)).not.toBeChecked();
  }

  // reload 后仍只有该 child 完成（证明作用于真实 item.id）
  await page.reload();
  await goToWorkspace(page, "调查");
  const allChecklistItemsAfterReload = page.getByRole("tab", { name: /全部/ });
  if (await allChecklistItemsAfterReload.count()) await allChecklistItemsAfterReload.click();
  const showMoreChecklistItemsAfterReload = page.getByRole("button", { name: /查看全部/ });
  if (await showMoreChecklistItemsAfterReload.count()) await showMoreChecklistItemsAfterReload.click();
  const sectionAfter = checklistSection(page);
  const groupAfter = sectionAfter
    .locator("li")
    .filter({ hasText: "系统核查 ·" })
    .filter({ hasText: GROUP_LABEL })
    .first();
  await groupAfter.getByRole("button", { name: "展开明细" }).click();
  const boxesAfter = groupAfter.locator('input[type="checkbox"]');
  await expect(boxesAfter.nth(targetIndex)).toBeChecked();
  const afterCount = await boxesAfter.count();
  for (let i = 0; i < afterCount; i += 1) {
    if (i === targetIndex) continue;
    await expect(boxesAfter.nth(i)).not.toBeChecked();
  }
});
