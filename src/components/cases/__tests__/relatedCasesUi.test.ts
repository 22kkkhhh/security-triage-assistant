import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { relatedCaseReasonLabels } from "@/components/cases/relatedCaseLabels";
import {
  historicalSignalLabels,
  investigationLeadLabels,
} from "@/components/cases/investigationIntelligenceLabels";
import { INVESTIGATION_SECTION_IDS } from "@/components/cases/investigationProgressSummary";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Historical Intelligence / Related Cases UI 契约", () => {
  const panel = readSrc("components/cases/RelatedCasesPanel.tsx");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const page = readSrc("app/(app)/cases/[id]/page.tsx");
  const nav = readSrc("components/cases/CaseInvestigationNav.tsx");

  it("reasons / signals / leads 使用稳定 code → 中文 label", () => {
    expect(relatedCaseReasonLabels.SAME_USERNAME).toBe("相同账号");
    expect(historicalSignalLabels.RECURRING_USERNAME).toBe("相同账号");
    expect(historicalSignalLabels.RECURRING_SOURCE_IP).toBe("相同源 IP");
    expect(historicalSignalLabels.RECURRING_SYSTEM).toBe("共同业务系统");
    expect(historicalSignalLabels.REPEATED_EXTERNAL_ALERT_ID).toBe(
      "重复原始告警 ID",
    );
    expect(investigationLeadLabels.VERIFY_RECURRING_ACCOUNT).toMatch(
      /^建议核查/,
    );
    expect(investigationLeadLabels.VERIFY_SOURCE_IP_OWNERSHIP).toMatch(
      /^建议核查/,
    );
    expect(investigationLeadLabels.COMPARE_SHARED_SYSTEM_ACTIVITY).toMatch(
      /^建议对比/,
    );
    expect(panel).toContain("formatHistoricalSignal");
    expect(panel).toContain("formatInvestigationLead");
    expect(panel).not.toMatch(
      /87%|AI 判断|同一攻击事件|已确认横向移动|已确认重复攻击|已失陷|持续攻击活动/,
    );
  });

  it("empty state 文案不宣称确认无关联", () => {
    expect(panel).toContain(
      "当前未发现具有明确共同调查事实的历史案件。",
    );
    expect(panel).not.toContain("确认无关联");
  });

  it("标题升级为历史调查线索；保留关联案件 cards + 对比入口", () => {
    expect(panel).toContain("历史调查线索");
    expect(panel).toContain('data-testid="related-cases-list"');
    expect(panel).toContain('data-testid="historical-signals"');
    expect(panel).toContain('data-testid="investigation-leads"');
    expect(panel).toContain("href={`/cases/${item.caseId}`}");
    expect(panel).toContain("对比调查");
    expect(workbench).toContain("currentCaseId={initial.caseId}");
  });

  it("导航含历史线索锚点", () => {
    expect(INVESTIGATION_SECTION_IDS.historicalLeads).toBe(
      "investigation-historical-leads",
    );
    expect(nav).toContain("历史线索");
    expect(nav).toContain("INVESTIGATION_SECTION_IDS.historicalLeads");
    expect(panel).toContain("INVESTIGATION_SECTION_IDS.historicalLeads");
  });

  it("page：单次 Related Cases 加载 + 纯函数 Intelligence；不 Client 全量筛选", () => {
    expect(page).toContain("loadRelatedCasesForCase");
    expect(page).toContain("buildInvestigationIntelligence");
    expect(page).toContain("toCurrentAnalysisHints");
    expect(page).toContain(
      "investigationIntelligence={investigationIntelligence}",
    );
    expect(page.match(/loadRelatedCasesForCase/g)?.length).toBe(2); // import + single call
    expect(workbench).toContain("RelatedCasesPanel");

    expect(workbench).toContain("investigationIntelligence");
    expect(workbench).not.toContain("findRelatedCases(");
    expect(workbench).not.toContain("listCases(");
  });

  it("CTA 仅为 scroll，无写操作", () => {
    expect(panel).toContain("cta-view-related-cases");
    expect(panel).toContain("scrollToInvestigationSection");
    expect(panel).not.toContain("applyChecklistCommandAction");
    expect(panel).not.toContain("updateBusinessContextAction");
    expect(panel).not.toContain("changeCaseStatusAction");
  });
});
