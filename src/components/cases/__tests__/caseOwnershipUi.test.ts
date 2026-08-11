import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSrc(relative: string): string {
  return readFileSync(
    path.resolve(process.cwd(), "src", relative),
    "utf8",
  );
}

describe("Case Ownership UI", () => {
  it("案件队列文案与 scope；保留 /cases route", () => {
    const page = readSrc("app/(app)/cases/page.tsx");
    expect(page).toContain("案件队列");
    expect(page).toContain('scope === "mine"');
    expect(page).toContain('scope === "unassigned"');
    expect(page).toContain("trustedCurrentUserId");
    expect(page).toContain("负责人：");
    expect(page).toContain("当前没有由你负责的案件。");
    expect(page).toContain("当前没有未分配案件。");

    const shell = readSrc("components/layout/AppShell.tsx");
    expect(shell).toContain("案件队列");
    expect(shell).not.toContain("历史案件");
  });

  it("Case Header 使用「案件负责人」并接入 Controls", () => {
    const header = readSrc("components/cases/CaseHeader.tsx");
    expect(header).toContain("CaseOwnershipControls");
    expect(header).toContain("canAssignCase");

    const controls = readSrc("components/cases/CaseOwnershipControls.tsx");
    expect(controls).toContain("案件负责人");
    expect(controls).toContain("接手案件");
    expect(controls).toContain("释放");
    expect(controls).toContain("case-ownership-admin-select");
  });

  it("Workbench 通过 assignCaseAction，不走 snapshot autosave", () => {
    const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(workbench).toContain("assignCaseAction");
    expect(workbench).toContain("handleAssign");
    expect(workbench).toContain("canAssignCase");
  });
});
