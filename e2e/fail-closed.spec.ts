import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.6-M1 E2E-04 — Fail-closed Runtime。
 *
 * 通过 src/lib/e2eHarness.ts 提供的 E2E-only test seam（只能来自 server
 * process env，代码级禁止 production 触发；见该文件注释）强制
 * `loadCaseWorkbenchRuntime.ts` 中真实的 compliance resolver 进入既有 catch，
 * 验证 Compliance / Compliance Checklist / Investigation Progress 三处 UI
 * 均显式展示「不可用」，且绝不能与「真实零 findings / 已解决」的成功空态
 * 展示相同文案 —— failure != true empty 的核心断言。
 *
 * 本测试只在 scripts/run-e2e.ts 的 Phase 2（E2E_HARNESS=1 +
 * E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE=1）下才会真正触发 unavailable
 * 路径；用 --grep @fail-closed 与 Phase 1 的正常路径测试隔离，避免互相污染。
 * 不测试 HumanReview 编辑，只断言其现有 fail-closed 提示存在。
 */

const CASE_B_ID = "demo-case-b";

const COMPLIANCE_UNAVAILABLE_MESSAGE = "合规参考暂不可用，请稍后重试。";
const COMPLIANCE_EMPTY_SUCCESS_MESSAGE = "当前未发现可展示的合规参考";

const CHECKLIST_UNAVAILABLE_MESSAGE =
  "合规核查建议暂不可用，请勿将当前状态视为无需核查。";
const CHECKLIST_EMPTY_SUCCESS_MESSAGE = "当前暂无额外合规核查事项";

const PROGRESS_UNAVAILABLE_MESSAGE =
  "调查进度暂不可用。当前无法完成重新解析，请稍后刷新后继续核查；不得将当前状态视为已完成核查或全部已解决。";
const PROGRESS_SUCCESS_ONLY_LABEL = "服务端投影 · 非最终结论";

const HUMAN_REVIEW_UNAVAILABLE_HINT =
  "调查进度暂不可用，当前无法确认核查状态；请结合现有证据完成人工研判。";

function sectionByHeading(page: Page, name: string | RegExp) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name }) });
}

test("@fail-closed resolver unavailable 不得伪装为空结果", async ({
  page,
}) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  // 8. Compliance（合规参考）必须显式 unavailable，不得与真实空结果同文案
  const complianceSection = sectionByHeading(page, "合规参考");
  await expect(complianceSection).toBeVisible();
  await expect(
    complianceSection.getByText(COMPLIANCE_UNAVAILABLE_MESSAGE),
  ).toBeVisible();
  await expect(
    complianceSection.getByText(COMPLIANCE_EMPTY_SUCCESS_MESSAGE),
  ).toHaveCount(0);

  // 9. Compliance Checklist（建议核查事项）同理
  const complianceChecklistSection = sectionByHeading(page, "建议核查事项");
  await expect(complianceChecklistSection).toBeVisible();
  await expect(
    complianceChecklistSection.getByText(CHECKLIST_UNAVAILABLE_MESSAGE),
  ).toBeVisible();
  await expect(
    complianceChecklistSection.getByText(CHECKLIST_EMPTY_SUCCESS_MESSAGE),
  ).toHaveCount(0);

  // 10. Investigation Progress（调查进度）同理：显式不可用，且不渲染成功态数值统计
  const progressSection = sectionByHeading(page, "调查进度");
  await expect(progressSection).toBeVisible();
  await expect(progressSection.getByText("当前不可用")).toBeVisible();
  await expect(
    page.getByTestId("investigation-progress-unavailable"),
  ).toHaveText(PROGRESS_UNAVAILABLE_MESSAGE);
  await expect(
    progressSection.getByText(PROGRESS_SUCCESS_ONLY_LABEL),
  ).toHaveCount(0);
  // exact:true 避免与 unavailable 文案中「…或全部已解决。」的子串误匹配
  await expect(
    page.getByText("待补充上下文", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("待收集证据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("待完成核查", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("已解决", { exact: true })).toHaveCount(0);

  // 11. HumanReview fail-closed hint（不测试 HumanReview 编辑）
  const humanReviewSection = sectionByHeading(page, "人工最终研判");
  await expect(
    humanReviewSection.getByText(HUMAN_REVIEW_UNAVAILABLE_HINT),
  ).toBeVisible();
});
