import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAsDemoUser } from "./helpers/auth";

/**
 * v1.6-M2-02：技术/审计字段降级隐藏。
 * 一级详情保持业务可读信息；supportingRuleIds / evidenceIds 等仅在「技术详情」展开后可见。
 */

const CASE_B_ID = "demo-case-b";

function sectionByHeading(page: Page, name: string | RegExp) {
  // 取 heading 最近祖先 section；name 用精确正则，避免「相关合规参考」等子串误匹配
  const headingName =
    typeof name === "string" ? new RegExp(`^${name}$`) : name;
  return page
    .getByRole("heading", { name: headingName })
    .locator("xpath=ancestor::section[1]");
}

test("技术详情默认关闭；一级不暴露内部字段名", async ({ page }) => {
  await loginAsDemoUser(page, DEMO_USERS.analyst);
  await page.goto(`/cases/${CASE_B_ID}`);

  // Overview：产品化文案，不得再出现「服务端投影」
  const progress = page.getByTestId("investigation-overview");
  await expect(progress.getByText("当前情况与优先动作 · 非最终结论")).toBeVisible();
  await expect(page.getByText("服务端投影")).toHaveCount(0);

  // Compliance：先展开合规参考 disclosure
  const complianceDetails = page.getByTestId("compliance-reference-details");
  await complianceDetails.locator("summary").click();
  const compliance = sectionByHeading(page, "合规参考");
  const firstCard = compliance.locator("article").first();
  await firstCard.getByRole("button", { name: "展开详情" }).click();
  await expect(firstCard.getByText("发布机关")).toBeVisible();
  await expect(firstCard.getByText("版本选择依据")).toBeVisible();
  await expect(firstCard.getByText("supportingRuleIds")).toHaveCount(0);
  await expect(firstCard.getByText("evidenceIds")).toHaveCount(0);
  await expect(firstCard.getByText("审计信息")).toHaveCount(0);

  // 二级技术详情：默认关闭；打开后出现中文技术字段，再收起消失
  const techToggle = firstCard.getByRole("button", { name: "技术详情" });
  await expect(techToggle).toBeVisible();
  await expect(firstCard.getByText("支撑规则")).toHaveCount(0);
  await expect(firstCard.getByText("关联证据")).toHaveCount(0);

  await techToggle.click();
  await expect(firstCard.getByText("支撑规则")).toBeVisible();
  await expect(firstCard.getByText("关联证据")).toBeVisible();

  await firstCard.getByRole("button", { name: "收起技术详情" }).click();
  await expect(firstCard.getByText("支撑规则")).toHaveCount(0);
  await expect(firstCard.getByText("关联证据")).toHaveCount(0);

  // Compliance Checklist：依据一级保留业务字段；内部字段仅在技术详情
  const suggestions = sectionByHeading(page, "建议核查事项");
  const firstSuggestion = suggestions.locator("li").first();
  await firstSuggestion.getByRole("button", { name: "依据" }).click();
  await expect(firstSuggestion.getByText("关联程度")).toBeVisible();
  await expect(firstSuggestion.getByText("关联控制")).toBeVisible();
  await expect(firstSuggestion.getByText("条款")).toBeVisible();
  await expect(firstSuggestion.getByText("supportingRuleIds")).toHaveCount(0);
  await expect(firstSuggestion.getByText("evidenceIds")).toHaveCount(0);

  await firstSuggestion.getByRole("button", { name: "技术详情" }).click();
  await expect(firstSuggestion.getByText("支撑规则")).toBeVisible();
  await expect(firstSuggestion.getByText("关联证据")).toBeVisible();
});
