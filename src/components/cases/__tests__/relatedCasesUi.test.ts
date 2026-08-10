import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { relatedCaseReasonLabels } from "@/components/cases/relatedCaseLabels";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Related Cases UI 契约", () => {
  const panel = readSrc("components/cases/RelatedCasesPanel.tsx");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const page = readSrc("app/(app)/cases/[id]/page.tsx");

  it("reasons 使用稳定 code → 中文 label", () => {
    expect(relatedCaseReasonLabels.SAME_USERNAME).toBe("相同账号");
    expect(relatedCaseReasonLabels.SAME_SOURCE_IP).toBe("相同源 IP");
    expect(relatedCaseReasonLabels.SHARED_SYSTEM).toBe("重叠业务系统");
    expect(relatedCaseReasonLabels.SAME_EXTERNAL_ALERT_ID).toBe(
      "原始告警 ID 相同",
    );
    expect(panel).toContain("formatRelatedCaseReason");
    expect(panel).not.toMatch(/87%|AI 判断|同一攻击事件|已确认横向移动/);
  });

  it("empty state 文案不宣称确认无关联", () => {
    expect(panel).toContain(
      "当前未发现具有明确共同调查事实的历史案件。",
    );
    expect(panel).not.toContain("确认无关联");
  });

  it("链接指向 /cases/{id}", () => {
    expect(panel).toContain("href={`/cases/${item.caseId}`}");
    expect(panel).toContain('data-testid="related-case-link"');
  });

  it("page → workbench 服务端注入；不 Client 全量筛选", () => {
    expect(page).toContain("loadRelatedCasesForCase");
    expect(page).toContain("relatedCases={relatedCases}");
    expect(workbench).toContain("RelatedCasesPanel");
    expect(workbench).toContain("relatedCases");
    expect(workbench).not.toContain("findRelatedCases(");
    expect(workbench).not.toContain("listCases(");
  });
});
