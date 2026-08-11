import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSrc(relative: string): string {
  return readFileSync(
    path.resolve(process.cwd(), "src", relative),
    "utf8",
  );
}

describe("Case Due Date UI", () => {
  it("队列支持 sort=due / 截止优先，并保留 scope 组合", () => {
    const page = readSrc("app/(app)/cases/page.tsx");
    expect(page).toContain('["due", "截止优先"]');
    expect(page).toContain("截止优先");
    expect(page).toContain("最近活动");
    expect(page).toContain('name="sort"');
    expect(page).toContain("case-list-due");
    expect(page).toContain("处理");
    expect(page).toContain("sort,");
    expect(page).not.toMatch(/priorityScore|urgencyScore|attentionScore/);
  });

  it("Header 接入独立 DueDate Controls，不合并为大 Save Operations", () => {
    const header = readSrc("components/cases/CaseHeader.tsx");
    expect(header).toContain("CaseDueDateControls");
    expect(header).toContain("canWriteDueDate");
    expect(header).toContain("onSetDueAt");
    expect(header).toContain("case-operational-meta");

    const controls = readSrc("components/cases/CaseDueDateControls.tsx");
    expect(controls).toContain("截止时间");
    expect(controls).toContain("接手案件后可设置截止时间");
    expect(controls).toContain("case-due-date-input");
    expect(controls).toContain("dueAtFormValueToIso");
  });

  it("Workbench 通过 setCaseDueAtAction，与 assign 独立", () => {
    const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(workbench).toContain("setCaseDueAtAction");
    expect(workbench).toContain("handleSetDueAt");
    expect(workbench).toContain("canWriteDueDate");
    expect(workbench).toContain("assignCaseAction");
  });
});
