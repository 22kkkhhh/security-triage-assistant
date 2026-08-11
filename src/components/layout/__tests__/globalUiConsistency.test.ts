/**
 * v1.10-M2：全局 UI Consistency 契约（不锁 Tailwind class）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("v1.10-M2 Global UI Consistency", () => {
  const casesPage = readSrc("app/(app)/cases/page.tsx");
  const newCasePage = readSrc("app/(app)/cases/new/page.tsx");
  const importFlow = readSrc("components/import/ImportFlow.tsx");
  const confirmation = readSrc("components/import/ConfirmationPanel.tsx");
  const compare = readSrc("components/cases/CaseComparisonPanel.tsx");
  const comparePage = readSrc(
    "app/(app)/cases/[id]/compare/[relatedId]/page.tsx",
  );
  const report = readSrc("components/report/PersistedReportEditor.tsx");
  const shell = readSrc("components/layout/AppShell.tsx");
  const pageHeader = readSrc("components/layout/PageHeader.tsx");
  const pageChrome = readSrc("components/layout/pageChrome.ts");

  it("复用 PageHeader / pageChrome（≥3 页面）", () => {
    expect(pageHeader).toContain("export function PageHeader");
    expect(pageChrome).toContain("pageWidth");
    expect(pageChrome).toContain("actionClass");
    expect(casesPage).toContain("PageHeader");
    expect(newCasePage).toContain("PageHeader");
    expect(comparePage).toContain("PageHeader");
    expect(readSrc("app/(app)/reports/page.tsx")).toContain("PageHeader");
  });

  it("AppShell：调查工作台气质；新建研判可强调但不改权限", () => {
    expect(shell).toContain("调查工作台");
    expect(shell).toContain("emphasize");
    expect(shell).toContain('href: "/cases/new"');
    expect(shell).toContain("NavigationCapabilities");
  });

  it("Case List：主列精简 + mobile 行；搜索为 secondary", () => {
    expect(casesPage).toContain("case-list-mobile");
    expect(casesPage).toContain("case-list-filters");
    expect(casesPage).toContain("暂无案件");
    expect(casesPage).toContain("待核查");
    expect(casesPage).not.toContain(">涉及账号<");
    expect(casesPage).not.toContain(">涉及系统<");
    expect(casesPage).not.toContain(">操作<");
    expect(casesPage).toContain("actionClass.primary");
    expect(casesPage).toContain("actionClass.secondary");
  });

  it("New Case：3 步 presentation；四方式保留；确认层级", () => {
    expect(importFlow).toContain("intake-step-indicator");
    expect(importFlow).toContain("选择来源");
    expect(importFlow).toContain("提供告警");
    expect(importFlow).toContain("确认并创建");
    expect(importFlow).toContain("手工录入");
    expect(importFlow).toContain("CSV 导入");
    expect(importFlow).toContain("JSON 导入");
    expect(importFlow).toContain("文本粘贴");
    expect(importFlow).toContain("role=\"tablist\"");
    expect(importFlow).toContain("import-source-type");
    expect(importFlow).toContain("确认导入内容");
    expect(confirmation).toContain("创建研判案件");
    expect(confirmation).toContain("返回修改");
  });

  it("Compare：共同事实优先；差异 disclosure；研判参考降级", () => {
    expect(compare).toContain("compare-shared-facts");
    expect(compare).toContain("共同事实");
    expect(compare).toContain("compare-diff-category");
    expect(compare).toContain("<details");
    expect(compare).toContain("研判参考");
    expect(compare).toContain("compare-history-review-warning");
    expect(compare).toContain("compare-diff-mobile");
    expect(compare).toContain("人工风险");
    expect(compare).toContain("系统建议");
    expect(compare).toContain("历史风险");
  });

  it("Report：document-like 编辑；工具栏层级；导出确认保留", () => {
    expect(report).toContain("pageWidth.document");
    expect(report).toContain("事件名称");
    expect(report).not.toContain('import { Panel }');
    expect(report).toContain("导出 Word");
    expect(report).toContain("预览");
    expect(report).toContain("使用脱敏版本导出");
    expect(report).toContain("保持原值导出");
    expect(report).toContain("report-export-confirm-title");
  });
});
