/**
 * UI RBAC 呈现契约：不引入渲染库；校验 capability 驱动的只读分支存在。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("AppShell / Navigation", () => {
  const src = readSrc("components/layout/AppShell.tsx");

  it("按 canCreateCase 过滤新建研判，不硬编码 role === VIEWER", () => {
    expect(src).toContain("requiresCreateCase");
    expect(src).toContain("navigation.canCreateCase");
    expect(src).not.toContain('role === "VIEWER"');
    expect(src).toContain("showReadOnlyHint");
  });

  it("用户管理 / 账户导航来自 capability，不硬编码 role === ADMIN", () => {
    expect(src).toContain("requiresManageUsers");
    expect(src).toContain("navigation.canManageUsers");
    expect(src).toContain("requiresChangeOwnPassword");
    expect(src).toContain("navigation.canChangeOwnPassword");
    expect(src).toContain("/admin/users");
    expect(src).toContain("/account");
    expect(src).not.toContain('role === "ADMIN"');
  });

  it("历史案件列表新建入口受 canCreateCase 控制", () => {
    const page = readSrc("app/(app)/cases/page.tsx");
    expect(page).toContain("buildNavigationCapabilities");
    expect(page).toContain("canCreateCase");
    expect(page).not.toContain('role === "VIEWER"');
  });
});

describe("Case Workbench Viewer presentation", () => {
  it("CaseHeader Status：无 canChangeStatus 时只读 Badge，非 disabled select", () => {
    const src = readSrc("components/cases/CaseHeader.tsx");
    expect(src).toContain("canChangeStatus");
    expect(src).toContain("caseStatusLabels[status]");
    expect(src).toContain("只读模式");
  });

  it("BusinessContext / HumanReview / Checklist / Timeline / Handoff 接受 capability", () => {
    expect(readSrc("components/BusinessContextPanel.tsx")).toContain(
      "canWriteStructured",
    );
    expect(readSrc("components/BusinessContextPanel.tsx")).toContain(
      "canWriteSnapshot",
    );
    expect(readSrc("components/HumanReviewPanel.tsx")).toContain(
      "canWriteSemantic",
    );
    expect(readSrc("components/HumanReviewPanel.tsx")).toContain("canWriteNote");
    expect(readSrc("components/ChecklistPanel.tsx")).toContain("canWrite");
    expect(readSrc("components/ChecklistPanel.tsx")).toContain("canEditNote");
    expect(readSrc("components/TimelinePanel.tsx")).toContain("canAdd");
    expect(readSrc("components/cases/CaseActivityPanel.tsx")).toContain(
      "canWriteHandoff",
    );
    expect(readSrc("components/cases/CaseActivityPanel.tsx")).toContain(
      "加载更多",
    );
  });

  it("PersistedCaseWorkbench：Viewer 禁止 scheduleSave；保留 FORBIDDEN 错误路径", () => {
    const src = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(src).toContain("capabilities.canSnapshotWrite");
    expect(src).toContain("if (!capabilities.canSnapshotWrite) return");
    expect(src).toContain("actionErrorMessage");
    expect(src).toContain("只读模式");
    expect(src).toContain("该案件尚未生成调查报告");
    expect(src).not.toContain('role === "VIEWER"');
  });

  it("PersistedCaseWorkbench：合规参考/核查清单只读接入，不在前端 resolve Knowledge", () => {
    const src = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(src).toContain("CaseCompliancePanel");
    expect(src).toContain("CaseComplianceChecklistPanel");
    expect(src).toContain("compliancePanel");
    expect(src).toContain("complianceChecklist");
    expect(src).not.toContain("resolveCaseCompliance");
    expect(src).not.toContain("loadCaseComplianceWorkbenchViews");
  });
});

describe("Report Viewer presentation", () => {
  it("CreateReportPanel / Export / Editor 受 capability 控制", () => {
    expect(readSrc("components/report/CreateReportPanel.tsx")).toContain(
      "canWrite",
    );
    expect(readSrc("components/report/CreateReportPanel.tsx")).toContain(
      "该案件尚未生成调查报告",
    );
    expect(readSrc("components/reports/ReportExportButton.tsx")).toContain(
      "当前账号无权限导出报告",
    );
    expect(readSrc("components/reports/ReportExportButton.tsx")).toContain(
      "canExport",
    );
    const editor = readSrc("components/report/PersistedReportEditor.tsx");
    expect(editor).toContain("capabilities");
    expect(editor).toContain("if (!canWrite) return");
    expect(editor).toContain('canWrite ? "edit" : "preview"');
  });
});
