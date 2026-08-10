/**
 * M4 RB-C1 回归：loadCaseWorkbenchRuntimeViews() 的 compliance resolver
 * 失败不得与「真实零 findings」展示相同文案。
 *
 * complianceResolutionStatus: SUCCESS | RESOLUTION_UNAVAILABLE
 * - resolver 抛出异常 → RESOLUTION_UNAVAILABLE（即便返回的 views 结构本身仍是空）
 * - resolver 正常返回但确无 findings → SUCCESS（沿用既有「真实空结果」文案）
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolveCaseComplianceResult } from "@/services/knowledge/resolveCaseCompliance";

const root = path.resolve(import.meta.dirname, "../../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

const resolveMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/knowledge/resolveCaseCompliance", () => ({
  resolveCaseCompliance: resolveMock,
}));

const { caseA } = await import("@/domain/demo");
const { loadCaseWorkbenchRuntimeViews } = await import(
  "@/app/(app)/cases/loadCaseWorkbenchRuntime"
);
type PersistedCaseFixture = Parameters<typeof loadCaseWorkbenchRuntimeViews>[0];

function buildRecord(): PersistedCaseFixture {
  return {
    id: caseA.id,
    caseNumber: "DEMO-0001",
    title: caseA.name,
    status: "INVESTIGATING",
    suggestedRiskLevel: null,
    humanRiskLevel: null,
    humanConclusion: null,
    username: null,
    sourceIp: null,
    systemsSearchText: null,
    pendingChecklistCount: 0,
    hasReport: false,
    reportUpdatedAt: null,
    lastActivityAt: "2026-08-10T00:00:00.000Z",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    closedAt: null,
    reportDraft: null,
    caseState: {
      caseData: {
        name: caseA.name,
        createdAt: caseA.createdAt,
        alert: caseA.alert,
        dataContext: caseA.dataContext,
        networkContext: caseA.networkContext,
        identityContext: caseA.identityContext,
      },
      businessContext: caseA.businessContext,
      checklist: [],
      humanReview: caseA.humanReview,
      timeline: caseA.timeline,
    },
  } as unknown as PersistedCaseFixture;
}

const zeroFindingsResult: ResolveCaseComplianceResult = {
  findings: [],
  allFindings: [],
  snapshots: [],
  caseDate: null,
  versionSelectionBasis: "CURRENT_DATE",
  hitRuleIds: [],
  skippedUnknownRuleIds: [],
};

describe("RB-C1：compliance resolver 失败 != 真实零 findings", () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  it("resolver 抛出异常 → complianceResolutionStatus = RESOLUTION_UNAVAILABLE", async () => {
    resolveMock.mockRejectedValue(new Error("Knowledge DB unavailable"));

    const runtime = await loadCaseWorkbenchRuntimeViews(buildRecord());

    expect(runtime.complianceResolutionStatus).toBe("RESOLUTION_UNAVAILABLE");
    expect(runtime.investigationProgress).toEqual({
      resolutionStatus: "RESOLUTION_UNAVAILABLE",
    });
    // 数据结构上仍是「空」，但状态位必须与真实空结果区分开
    expect(runtime.compliance.panel.empty).toBe(true);
    expect(runtime.compliance.checklist.empty).toBe(true);
  });

  it("resolver 正常返回且确无 findings → complianceResolutionStatus = SUCCESS", async () => {
    resolveMock.mockResolvedValue(zeroFindingsResult);

    const runtime = await loadCaseWorkbenchRuntimeViews(buildRecord());

    expect(runtime.complianceResolutionStatus).toBe("SUCCESS");
    expect(runtime.compliance.panel.empty).toBe(true);
    expect(runtime.compliance.checklist.empty).toBe(true);
    expect(runtime.investigationProgress.resolutionStatus).toBe("SUCCESS");
  });

  it("resolver 抛出异常与真实零 findings 的 complianceResolutionStatus 不同（防止 UI 混淆）", async () => {
    resolveMock.mockRejectedValue(new Error("boom"));
    const failed = await loadCaseWorkbenchRuntimeViews(buildRecord());

    resolveMock.mockResolvedValue(zeroFindingsResult);
    const succeeded = await loadCaseWorkbenchRuntimeViews(buildRecord());

    expect(failed.complianceResolutionStatus).not.toBe(
      succeeded.complianceResolutionStatus,
    );
    // 两者的 views 数据形状可以相同（都是空），区分点必须落在 resolutionStatus
    expect(failed.compliance).toEqual(succeeded.compliance);
  });
});

describe("RB-C1：Case 详情页透传 complianceResolutionStatus", () => {
  it("Server page 把 runtimeViews.complianceResolutionStatus 传给 Workbench", () => {
    const page = readSrc("app/(app)/cases/[id]/page.tsx");
    expect(page).toContain(
      "complianceResolutionStatus={runtimeViews.complianceResolutionStatus}",
    );
  });

  it("Workbench 把 complianceResolutionStatus 透传给两个面板", () => {
    const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(workbench).toMatch(
      /<CaseCompliancePanel[\s\S]*?resolutionStatus=\{complianceResolutionStatus\}/,
    );
    expect(workbench).toMatch(
      /<CaseComplianceChecklistPanel[\s\S]*?resolutionStatus=\{complianceResolutionStatus\}/,
    );
  });
});

describe("RB-C1：面板文案随 resolutionStatus 区分（真实空 vs 不可用）", () => {
  it("CaseCompliancePanel：RESOLUTION_UNAVAILABLE 显式提示，不与真实空文案混用", () => {
    const src = readSrc("components/cases/CaseCompliancePanel.tsx");
    expect(src).toContain("合规参考暂不可用，请稍后重试。");
    expect(src).toContain('resolutionStatus === "RESOLUTION_UNAVAILABLE"');
    // unavailable 分支优先于 view.empty 判断，两者互斥展示
    expect(src).toMatch(
      /\{unavailable \? \([\s\S]*?CASE_COMPLIANCE_PANEL_UNAVAILABLE_MESSAGE[\s\S]*?\) : view\.empty \? \([\s\S]*?当前未发现可展示的合规参考/,
    );
  });

  it("CaseComplianceChecklistPanel：RESOLUTION_UNAVAILABLE 显式提示，不与真实空文案混用", () => {
    const src = readSrc(
      "components/cases/CaseComplianceChecklistPanel.tsx",
    );
    expect(src).toContain(
      "合规核查建议暂不可用，请勿将当前状态视为无需核查。",
    );
    expect(src).toContain('resolutionStatus === "RESOLUTION_UNAVAILABLE"');
    expect(src).toMatch(
      /\{unavailable \? \([\s\S]*?CASE_COMPLIANCE_CHECKLIST_UNAVAILABLE_MESSAGE[\s\S]*?\) : view\.empty \? \([\s\S]*?当前暂无额外合规核查事项/,
    );
  });

  it("默认 resolutionStatus 为 SUCCESS，既有调用方/测试不受影响", () => {
    const panel = readSrc("components/cases/CaseCompliancePanel.tsx");
    const checklist = readSrc(
      "components/cases/CaseComplianceChecklistPanel.tsx",
    );
    expect(panel).toContain('resolutionStatus = "SUCCESS"');
    expect(checklist).toContain('resolutionStatus = "SUCCESS"');
  });
});
