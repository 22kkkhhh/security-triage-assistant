import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPARISON_HISTORY_REVIEW_WARNING,
  COMPARISON_MISSING_DISPLAY,
  COMPARISON_SAFETY_DISCLAIMER,
} from "@/components/cases/caseComparisonLabels";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Case Comparison UI 契约", () => {
  const panel = readSrc("components/cases/CaseComparisonPanel.tsx");
  const page = readSrc("app/(app)/cases/[id]/compare/[relatedId]/page.tsx");
  const relatedPanel = readSrc("components/cases/RelatedCasesPanel.tsx");
  const loader = readSrc("services/correlation/loadCaseComparison.ts");

  it("safety disclaimer + history warning + missing label", () => {
    expect(COMPARISON_SAFETY_DISCLAIMER).toContain("不表示两个案件属于同一安全事件");
    expect(COMPARISON_HISTORY_REVIEW_WARNING).toContain("不自动继承");
    expect(COMPARISON_MISSING_DISPLAY).toBe("暂缺信息");
    expect(panel).toContain("COMPARISON_SAFETY_DISCLAIMER");
    expect(panel).toContain("COMPARISON_HISTORY_REVIEW_WARNING");
    expect(panel).toContain("当前案件");
    expect(panel).toContain("历史案件");
    expect(panel).toContain("共同事实");
    expect(panel).toContain("compare-diff-category");
    expect(panel).toContain("研判参考");
    expect(panel).toContain("md:grid-cols-2");
    expect(panel).not.toMatch(
      /同一攻击者|同一攻击链|已确认关联攻击|横向移动|campaign|confidence %|92%/,
    );
  });

  it("RelatedCasesPanel 提供对比调查入口", () => {
    expect(relatedPanel).toContain("对比调查");
    expect(relatedPanel).toContain(
      "`/cases/${currentCaseId}/compare/${item.caseId}`",
    );
    expect(relatedPanel).toContain('data-testid="related-case-compare-link"');
  });

  it("compare page：CASE_READ + pair loader；无写操作", () => {
    expect(page).toContain('requirePermission("CASE_READ")');
    expect(page).toContain("loadCaseComparison");
    expect(page).not.toContain("updateHumanReviewAction");
    expect(page).not.toContain("applyChecklistCommandAction");
    expect(page).not.toContain("changeCaseStatusAction");
    expect(page).not.toContain("useCaseAutosave");
    expect(loader).toContain("getCaseById");
    expect(loader).not.toContain("RELATED_CASES_SCAN_CAP");
    expect(loader).not.toContain("loadRelatedCasesForCase");
  });
});
