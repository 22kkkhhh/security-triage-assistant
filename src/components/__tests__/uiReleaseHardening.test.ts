/**
 * v1.5 M4 Workstream D1：UI Release Hardening 契约测试。
 * 不引入渲染库；源码契约 + 导出导航 helper。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCaseListNavActive,
  isCaseReportPath,
  isReportsNavActive,
} from "@/components/layout/appShellNav";

const root = path.resolve(import.meta.dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("S1 Progress Refresh（Checklist / HumanReview）", () => {
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");

  it("Checklist 语义命令成功路径调用 router.refresh（经 refreshComplianceAfterContextPersist）", () => {
    expect(workbench).toContain("applyChecklistCommandAction");
    expect(workbench).toMatch(
      /applyChecklistCommandAction[\s\S]*?mergeReturnedAudit\(result\.audit\);\n\s*refreshComplianceAfterContextPersist\(\);/,
    );
    expect(workbench).toContain("refreshComplianceAfterContextPersist");
    expect(workbench).toContain("router.refresh()");
  });

  it("HumanReview 语义命令成功路径调用 router.refresh", () => {
    expect(workbench).toContain("updateHumanReviewAction");
    expect(workbench).toMatch(
      /updateHumanReviewAction[\s\S]*?mergeReturnedAudit\(result\.audit\);\n\s*refreshComplianceAfterContextPersist\(\);/,
    );
  });

  it("不新增 Client compliance resolver / 第二次专用 fetch", () => {
    expect(workbench).not.toContain("resolveCaseCompliance");
    expect(workbench).not.toContain("resolveInvestigationProgress");
    expect(workbench).not.toContain("loadCaseComplianceWorkbenchViews");
    expect(workbench).not.toContain("refreshCaseComplianceRuntimeViews");
    expect(workbench).not.toContain('from "@/lib/prisma"');
  });
});

describe("S3 Command In-flight UX", () => {
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const header = readSrc("components/cases/CaseHeader.tsx");
  const bc = readSrc("components/BusinessContextPanel.tsx");

  it("commandPending 与 autosave 状态分离", () => {
    expect(workbench).toContain("commandPending");
    expect(workbench).toContain("setCommandPending");
    expect(workbench).toContain("commandPending={commandPending}");
    expect(header).toContain("commandPending");
    expect(header).toContain("处理中…");
    expect(bc).toContain("commandPending");
    expect(bc).toContain("提交中…");
    expect(header).not.toMatch(
      /case status === "COMMAND_PENDING"|AutosaveState.*COMMAND/,
    );
  });

  it("语义命令 pending 时不展示「已保存」", () => {
    expect(header).toContain(
      '{commandPending ? "处理中…" : saveStatusLabel(saveState)}',
    );
    expect(bc).toContain('commandPending\n    ? "提交中…"');
  });
});

describe("S4/S5 Reports Navigation", () => {
  it("案件报告路由不高亮历史案件，高亮报告中心", () => {
    expect(isCaseReportPath("/cases/abc/report")).toBe(true);
    expect(isCaseReportPath("/cases/abc")).toBe(false);
    expect(isCaseListNavActive("/cases/abc/report")).toBe(false);
    expect(isCaseListNavActive("/cases/abc")).toBe(true);
    expect(isCaseListNavActive("/cases")).toBe(true);
    expect(isReportsNavActive("/cases/abc/report")).toBe(true);
    expect(isReportsNavActive("/reports")).toBe(true);
    expect(isReportsNavActive("/cases/abc")).toBe(false);
  });

  it("CreateReportPanel 提供返回本案（真实 caseId）", () => {
    const src = readSrc("components/report/CreateReportPanel.tsx");
    expect(src).toContain("返回本案");
    expect(src).toContain("href={`/cases/${caseId}`}");
  });
});

describe("S6 Loading / Not Found", () => {
  it("存在中文 loading / not-found，不泄露内部错误", () => {
    const loading = readSrc("app/(app)/loading.tsx");
    const notFound = readSrc("app/(app)/not-found.tsx");
    expect(loading).toContain("加载中");
    expect(notFound).toContain("未找到页面");
    expect(notFound).toContain("返回历史案件");
    expect(loading).not.toMatch(/stack|Prisma|INTERNAL|Error:/i);
    expect(notFound).not.toMatch(/stack|Prisma|INTERNAL|Error:/i);
  });
});

describe("S7 Responsive Sidebar", () => {
  const src = readSrc("components/layout/AppShell.tsx");

  it("桌面保留固定侧栏；窄屏可折叠抽屉，无重量级 dependency", () => {
    expect(src).toContain("w-[230px]");
    expect(src).toContain("md:hidden");
    expect(src).toContain("md:static");
    expect(src).toContain("navOpenForPath");
    expect(src).toContain("打开导航菜单");
    expect(src).not.toContain("@headlessui");
    expect(src).not.toContain("@radix-ui");
    expect(src).not.toContain("framer-motion");
  });
});

describe("S8 Basic Accessibility", () => {
  it("Checklist writable checkbox 有含标签的 accessible name", () => {
    const src = readSrc("components/ChecklistPanel.tsx");
    expect(src).toContain("aria-label=");
    expect(src).toMatch(
      /aria-label=\{`\$\{item\.label\}（\$\{item\.completed \? "已完成" : "未完成"\}）`\}/,
    );
  });

  it("BusinessContext FieldBlock label ↔ control htmlFor/id", () => {
    const src = readSrc("components/BusinessContextPanel.tsx");
    expect(src).toContain("controlId");
    expect(src).toContain("htmlFor={controlId}");
    expect(src).toContain('controlId="bc-planned-task-status"');
    expect(src).toContain('id="bc-planned-task-status"');
    expect(src).toContain('controlId="bc-business-justification"');
    expect(src).toContain('id="bc-business-justification"');
  });
});

describe("VIEWER / 禁改边界 regression", () => {
  it("VIEWER 不出现新增写能力（仍由 capability 门控）", () => {
    const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(workbench).toContain("capabilities.canWriteChecklist");
    expect(workbench).toContain("capabilities.canWriteHumanReview");
    expect(workbench).toContain("capabilities.canWriteBusinessContext");
    expect(workbench).toContain("if (!capabilities.canSnapshotWrite) return");
    expect(workbench).not.toContain('role === "VIEWER"');
    expect(workbench).not.toContain("resolveCaseCompliance");
  });

  it("本轮未处理 S2 loader fail-open / duplicate SYSTEM labels", () => {
    const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(workbench).not.toContain("loadCaseWorkbenchRuntime");
    expect(readSrc("components/ChecklistPanel.tsx")).not.toContain(
      "suggestionKey",
    );
  });
});
