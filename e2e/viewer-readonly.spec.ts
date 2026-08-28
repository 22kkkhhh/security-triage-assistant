import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";
import { goToWorkspace } from "./helpers/workbench";

/**
 * v1.6-M1 E2E-03 — VIEWER Read-only。
 *
 * demo-viewer 登录（真实 Better Auth，不 mock Session/RBAC）：
 * - /cases 可访问
 * - Case Workbench（demo-case-b）可读；Business Context / Checklist / HumanReview
 *   均不可编辑（无交互控件），但内容仍可见
 * - Report（demo-case-a）可读；不可编辑、不可导出（导出按钮 disabled）
 *
 * 本测试只验证真实浏览器 VIEWER UX/RBAC boundary（read allowed / mutation UI
 * unavailable / export unavailable）；Server 侧授权边界已由
 * src/services/auth/__tests__/serverAuthorization.test.ts 的
 * “SERVER_ACTION_PERMISSIONS 中每个权限至少有一条真实 Action 拒绝路径（VIEWER）”
 * 等既有 regression 覆盖，此处不重复伪造 Server Action wire protocol。
 *
 * 不依赖 E2E-01 / E2E-02 是否先运行、Case B 当前 HumanReview 内容或 Case A
 * 当前 report title；只依赖 Case A report 存在、Case B 存在、Viewer 权限模型。
 */

const CASE_B_ID = "demo-case-b";
const CASE_B_NUMBER = "INC-20260808-002";
const CASE_A_ID = "demo-case-a";
const CASE_A_NUMBER = "INC-20260808-001";

/** 取标题最近的 section（避免外层调查工作区误匹配） */
function sectionByHeading(page: Page, name: string | RegExp) {
  return page
    .getByRole("heading", { name })
    .locator("xpath=ancestor::section[1]");
}

test("demo-viewer 在 Case Workbench 与 Report 中仅可读，无任何可编辑/导出控件", async ({
  page,
}) => {
  // 1. VIEWER 登录：真实 Better Auth，登录后进入 authenticated /cases
  await loginAsDemoUser(page, DEMO_USERS.viewer);
  await expect(
    page.getByRole("heading", { name: "案件队列" }),
  ).toBeVisible();

  // 2. Case Workbench 可读：只验证页面能正常读取，不依赖具体业务字段值
  await page.goto(`/cases/${CASE_B_ID}`);
  await goToWorkspace(page, "调查");
  await expect(page.getByText(CASE_B_NUMBER).first()).toBeVisible();

  // 3. Business Context 必须只读：内容可见，但 panel 内无任何 input/textarea/select
  const businessContextSection = sectionByHeading(page, "业务合理性核查");
  await expect(businessContextSection).toBeVisible();
  await expect(
    businessContextSection.locator("input, textarea, select"),
  ).toHaveCount(0);
  await expect(businessContextSection.getByText("只读查看")).toBeVisible();

  // 4. Checklist 必须只读：内容可见，但无 checkbox / 新增按钮 / 新增输入框 / 删除按钮
  const checklistSection = sectionByHeading(page, /^待核查事项/);
  await expect(checklistSection).toBeVisible();
  await expect(
    checklistSection.locator('input[type="checkbox"]'),
  ).toHaveCount(0);
  await expect(checklistSection.locator("input")).toHaveCount(0);
  await expect(checklistSection.locator("select")).toHaveCount(0);
  await expect(
    checklistSection.getByRole("button", { name: "新增" }),
  ).toHaveCount(0);
  await expect(
    checklistSection.getByRole("button", { name: "删除" }),
  ).toHaveCount(0);

  // 5. HumanReview 必须只读：内容可见，但无 select / textarea；只读提示存在
  const humanReviewSection = sectionByHeading(page, "人工最终研判");
  await expect(humanReviewSection).toBeVisible();
  await expect(humanReviewSection.locator("select")).toHaveCount(0);
  await expect(humanReviewSection.locator("textarea")).toHaveCount(0);
  await expect(humanReviewSection.getByText("只读查看")).toBeVisible();

  // 6. Report（demo-case-a）可读，但不可编辑、不可导出
  await page.goto(`/cases/${CASE_A_ID}/report`);
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_A_ID}/report$`));
  await expect(page.getByText(CASE_A_NUMBER).first()).toBeVisible();
  await expect(page.getByText("报告状态：只读查看")).toBeVisible();
  await expect(
    page.getByText(
      "只读模式：可查看报告内容，但不能编辑或自动保存。",
    ),
  ).toBeVisible();
  // Report 正文（Preview）仍应正常展示
  await expect(
    page.getByRole("heading", { name: "数据与网络安全事件调查分析报告" }),
  ).toBeVisible();

  const main = page.locator("main");
  await expect(page.getByRole("button", { name: "继续编辑" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "事件名称" })).toHaveCount(
    0,
  );
  await expect(main.locator("textarea")).toHaveCount(0);

  const exportButton = page.getByRole("button", { name: "导出 Word" });
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText("当前账号无权限导出报告")).toBeVisible();
});
