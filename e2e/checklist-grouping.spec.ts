import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.6-M2-01：SYSTEM checklist 展示分组。
 * 不改变 item.id / completion 语义；只验证 UI 去重复感与单 child 独立操作。
 */

const CASE_B_ID = "demo-case-b";
const GROUP_LABEL = "联系业务负责人";

function checklistSection(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^待核查事项/ }) });
}

test("SYSTEM 同 label 折叠为 group；展开后单 child 独立完成", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

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

  const first = childCheckboxes.first();
  const firstLabel = (await first.getAttribute("aria-label")) ?? "";
  expect(firstLabel).toContain(GROUP_LABEL);
  expect(firstLabel).toContain("未完成");

  // 只勾选第一个真实 child（语义命令按具体 item.id）
  await first.check();
  await expect(page.getByText("处理中…")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("保存失败")).toHaveCount(0);
  await expect(first).toBeChecked();
  await expect(first).toHaveAttribute(
    "aria-label",
    `${GROUP_LABEL}（已完成）`,
  );

  // 同 group 其它 child 不得被批量完成
  for (let i = 1; i < childCount; i += 1) {
    await expect(childCheckboxes.nth(i)).not.toBeChecked();
  }

  // reload 后仍只有该 child 完成（证明作用于真实 item.id）
  await page.reload();
  const sectionAfter = checklistSection(page);
  const groupAfter = sectionAfter
    .locator("li")
    .filter({ hasText: "系统核查 ·" })
    .filter({ hasText: GROUP_LABEL })
    .first();
  await groupAfter.getByRole("button", { name: "展开明细" }).click();
  const boxesAfter = groupAfter.locator('input[type="checkbox"]');
  await expect(boxesAfter.first()).toBeChecked();
  const afterCount = await boxesAfter.count();
  for (let i = 1; i < afterCount; i += 1) {
    await expect(boxesAfter.nth(i)).not.toBeChecked();
  }
});
