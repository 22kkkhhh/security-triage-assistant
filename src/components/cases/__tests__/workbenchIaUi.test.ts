/**
 * v1.10-M1：Workbench IA — 用户层级契约（不锁死 Tailwind）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveKeyFindings } from "@/components/cases/InvestigationProgressPanel";
import { formatHeaderRiskLabel } from "@/components/cases/CaseHeader";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Workbench IA redesign 契约", () => {
  const nav = readSrc("components/cases/CaseInvestigationNav.tsx");
  const overview = readSrc("components/cases/InvestigationProgressPanel.tsx");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const historical = readSrc("components/cases/RelatedCasesPanel.tsx");

  it("主导航为 概览 / 调查 / 分析 / 记录", () => {
    expect(nav).toContain('label: "概览"');
    expect(nav).toContain('label: "调查"');
    expect(nav).toContain('label: "分析"');
    expect(nav).toContain('label: "记录"');
    expect(nav).not.toContain('label: "历史线索"');
    expect(nav).not.toContain('label: "业务上下文"');
    expect(nav).not.toContain('label: "证据与核查"');
    expect(nav).not.toContain('label: "人工研判"');
    expect(nav).not.toContain('label: "分析与合规"');
    expect(nav).not.toContain('label: "活动记录"');
  });

  it("Overview：Next Step 优先；最多 3 个主指标；无第二排 4 格统计", () => {
    expect(overview).toContain("建议下一步");
    expect(overview).toContain("case-next-step");
    expect(overview).toContain("overview-primary-metrics");
    expect(overview).toContain("技术异常");
    expect(overview).toContain("信息不足");
    expect(overview).toContain("待处理");
    expect(overview).not.toContain("待补充上下文");
    expect(overview).not.toContain("待收集证据");
    expect(overview).not.toContain("系统建议风险");
    expect(overview).not.toContain("sm:grid-cols-4");
  });

  it("Investigation 四步结构", () => {
    expect(workbench).toContain('title="业务确认"');
    expect(workbench).toContain('title="证据与核查"');
    expect(workbench).toContain('title="历史线索"');
    expect(workbench).toContain('title="最终研判"');
    expect(workbench).toContain("InvestigationStepSection");
  });

  it("Historical：默认 compact + 展开保留 Leads / Related / Compare", () => {
    expect(historical).toContain("historical-leads-expand");
    expect(historical).toContain("展开历史线索");
    expect(historical).toContain('data-testid="investigation-leads"');
    expect(historical).toContain('data-testid="related-cases-list"');
    expect(historical).toContain("对比调查");
    expect(historical).toContain("加入核查清单");
  });

  it("Analysis / Records progressive disclosure", () => {
    expect(workbench).toContain('title="分析"');
    expect(workbench).toContain("system-analysis-details");
    expect(workbench).toContain("compliance-reference-details");
    expect(workbench).toContain("合规参考");
    expect(workbench).toContain('title="记录"');
    expect(workbench).toContain("timeline-details");
    expect(workbench).toContain("activity-details");
    // M2：Timeline 默认 open；Audit 默认 collapsed
    expect(workbench).toMatch(/<details open data-testid="timeline-details">/);
    expect(workbench).toMatch(/<details data-testid="activity-details">/);
    expect(workbench).not.toMatch(
      /<details open data-testid="activity-details">/,
    );
  });

  it("Checklist-first：证据为 secondary disclosure", () => {
    expect(workbench).toContain("evidence-disclosure");
    expect(workbench).toContain("查看系统证据");
    expect(workbench).toContain("<ChecklistPanel");
  });

  it("Header 风险来源可区分", () => {
    expect(formatHeaderRiskLabel("HIGH", "LOW")).toBe("人工风险 高风险");
    expect(formatHeaderRiskLabel(null, "HIGH")).toBe("系统建议 高风险");
    expect(formatHeaderRiskLabel(null, null)).toBe("暂无法评级");
  });

  it("关键发现最多 3 条且用语克制", () => {
    const findings = deriveKeyFindings({
      relatedCaseCount: 2,
      abnormalCount: 3,
      unknownCount: 1,
      pendingChecklistCount: 4,
    });
    expect(findings).toHaveLength(3);
    expect(findings.join("")).not.toMatch(/高危攻击|持续攻击|同一事件/);
  });
});
