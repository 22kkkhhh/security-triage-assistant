import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.6-M1 E2E-01 — Analyst Investigation。
 *
 * demo-analyst 登录 → demo-case-b（INC-20260808-002）
 * → Business Context 字段真实持久化（Snapshot autosave）
 * → Checklist 完成一项（语义命令）
 * → HumanReview 修改最终结论 / 风险等级 / 研判说明
 * → page.reload() → 五项数据仍存在，证明来自 Server persistence，而非本地 state / false SAVED。
 *
 * 选择字段说明：
 * - Business Context：businessJustification（业务合理性说明），走 Snapshot autosave（非结构化字段）。
 * - Checklist：CL-4「确认数据是否被导出及去向」——Case B 初始 checklist 中标签唯一且明确未完成
 *   （seed 只将 CL-8 标记为已完成，其余均为未完成；多数其他标签如「核查计划任务」在 Case B 中重复出现，
 *   不满足“稳定唯一 label”要求，因此不选用）。
 */

const CASE_B_ID = "demo-case-b";
const CASE_B_NUMBER = "INC-20260808-002";
const CHECKLIST_ITEM_LABEL = "确认数据是否被导出及去向";

const SAVED_TEXT = /^已保存/;
const SAVING_OR_DIRTY_TEXT = /待保存…|保存中…/;
const COMMAND_PENDING_TEXT = "处理中…";

async function expectNoFailureVisible(page: Page): Promise<void> {
  await expect(page.getByText("保存失败").first()).toHaveCount(0);
  await expect(page.getByText(COMMAND_PENDING_TEXT).first()).toHaveCount(0);
}

/**
 * 等待一次 Snapshot autosave 真实走完：先出现 dirty/saving，再出现已保存，且无保存失败。
 * 同一 saveState 会同时展示在 CaseHeader 顶部栏与 BusinessContextPanel 头部，
 * 因此这里只取 .first() 确认「至少有一处」反映了状态变化，不依赖具体是哪一处。
 */
async function waitForSnapshotSaveRoundTrip(page: Page): Promise<void> {
  await expect(page.getByText(SAVING_OR_DIRTY_TEXT).first()).toBeVisible();
  await expect(page.getByText(SAVED_TEXT).first()).toBeVisible({
    timeout: 10_000,
  });
  await expectNoFailureVisible(page);
}

/** 等待一次语义命令飞行结束（Checklist toggle / HumanReview 结构化字段）。 */
async function waitForSemanticCommandSettled(page: Page): Promise<void> {
  await expect(page.getByText(COMMAND_PENDING_TEXT)).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.getByText("保存失败")).toHaveCount(0);
}

test("demo-analyst 在 demo-case-b 的修改在 reload 后仍真实持久化", async ({
  page,
}) => {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const businessJustificationValue = `E2E Analyst Investigation ${uniqueId}`;
  const conclusionNoteValue = `E2E persistence verification ${uniqueId}`;

  await loginAsDemoUser(page, DEMO_USERS.analyst);

  await page.goto(`/cases/${CASE_B_ID}`);
  // 案件编号在页头/风险徽标等处会多次出现；只需确认已进入正确案件页。
  await expect(page.getByText(CASE_B_NUMBER).first()).toBeVisible();

  // 2. Business Context：业务合理性说明（Snapshot autosave，非结构化字段）
  const businessJustificationField = page.getByLabel("业务合理性说明");
  await businessJustificationField.fill(businessJustificationValue);
  await waitForSnapshotSaveRoundTrip(page);

  // 3. Checklist：CL-4「确认数据是否被导出及去向」未完成 → 已完成
  const checklistCheckbox = page.getByLabel(
    `${CHECKLIST_ITEM_LABEL}（未完成）`,
  );
  await checklistCheckbox.check();
  await waitForSemanticCommandSettled(page);
  await expect(
    page.getByLabel(`${CHECKLIST_ITEM_LABEL}（已完成）`),
  ).toBeChecked();

  // 4. HumanReview：最终结论 / 人工风险等级（结构化，语义命令）
  const finalConclusionSelect = page.getByLabel("最终结论");
  await finalConclusionSelect.selectOption({ label: "暂无法定论" });
  await waitForSemanticCommandSettled(page);
  await expect(finalConclusionSelect).toHaveValue("INCONCLUSIVE");

  const humanRiskLevelSelect = page.getByLabel("人工风险等级");
  await humanRiskLevelSelect.selectOption({ label: "中风险" });
  await waitForSemanticCommandSettled(page);
  await expect(humanRiskLevelSelect).toHaveValue("MEDIUM");

  // HumanReview：研判说明（非结构化字段，走同一条 Snapshot autosave 队列）
  const conclusionNoteField = page.getByLabel("研判说明");
  await conclusionNoteField.fill(conclusionNoteValue);
  await waitForSnapshotSaveRoundTrip(page);

  // 5. 最关键的 reload 验收：证明五项均来自 Server persistence，而非本地 state / false SAVED。
  await page.reload();

  // A. BusinessContext unique value 仍存在
  await expect(page.getByLabel("业务合理性说明")).toHaveValue(
    businessJustificationValue,
  );

  // B. 指定 Checklist item 仍为 completed
  await expect(
    page.getByLabel(`${CHECKLIST_ITEM_LABEL}（已完成）`),
  ).toBeChecked();

  // C. HumanReview 最终结论仍为「暂无法定论」
  await expect(page.getByLabel("最终结论")).toHaveValue("INCONCLUSIVE");

  // D. HumanReview 风险等级仍为「中风险」
  await expect(page.getByLabel("人工风险等级")).toHaveValue("MEDIUM");

  // E. HumanReview unique note 仍存在
  await expect(page.getByLabel("研判说明")).toHaveValue(conclusionNoteValue);

  await expectNoFailureVisible(page);
});
