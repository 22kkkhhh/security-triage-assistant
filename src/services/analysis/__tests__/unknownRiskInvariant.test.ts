import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { displayRiskLevel } from "@/domain/labels";
import type { SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { allRules } from "@/services/analysis/runRules";
import { unknownEvaluation } from "@/services/analysis/ruleHelpers";
import { buildSuggestedAssessment } from "@/services/analysis/suggestedAssessment";
import { buildReportData } from "@/services/reporting/reportBuilder";
import { generateDocxBuffer } from "@/services/reporting/docxGenerator";

const analyzedA = analyzeSecurityCase(caseA);
const analyzedB = analyzeSecurityCase(caseB);

describe("Domain Invariant：UNKNOWN ≠ LOW", () => {
  it("unknownEvaluation 工厂输出 riskLevel null", () => {
    const result = unknownEvaluation("缺少数据", ["补充日志"]);
    expect(result.status).toBe("UNKNOWN");
    expect(result.riskLevel).toBeNull();
  });

  it("所有 UNKNOWN AnalysisResult 的 riskLevel 不得为 LOW，必须为 null", () => {
    for (const securityCase of [analyzedA, analyzedB]) {
      const unknownResults = securityCase.analysisResults.filter(
        (r) => r.status === "UNKNOWN",
      );
      expect(unknownResults.length).toBeGreaterThan(0);
      for (const result of unknownResults) {
        expect(result.riskLevel).toBeNull();
        expect(result.riskLevel).not.toBe("LOW");
      }
    }
  });

  it("全部静态规则在缺数据路径下 UNKNOWN 输出 riskLevel null", () => {
    const emptyDraft: SecurityCaseDraft = {
      ...caseA,
      id: "invariant-all-unknown-inputs",
      dataContext: {
        ...caseA.dataContext,
        accessStatus: "UNKNOWN",
        accessedRecordCount: null,
        baseline: null,
        outsideBusinessHours: "UNKNOWN",
        sensitiveFieldTypes: [],
      },
      networkContext: {
        ...caseA.networkContext,
        networkStatus: "UNKNOWN",
        externalCommunication: "UNKNOWN",
        externalDestination: null,
        outboundTransferBytes: null,
      },
      identityContext: {
        ...caseA.identityContext,
        identityStatus: "UNKNOWN",
        loginFromUnseenSource: "UNKNOWN",
        failedLoginAttempts: null,
        accessedSystems: [],
      },
      businessContext: {
        ...caseA.businessContext,
        plannedTaskStatus: "UNKNOWN",
        changeTicketStatus: "UNKNOWN",
        changeTicketId: null,
        ownerVerification: "UNKNOWN",
        businessLegitimacy: "UNKNOWN",
        businessJustification: null,
      },
    };
    const analyzed = analyzeSecurityCase(emptyDraft);
    expect(analyzed.analysisResults).toHaveLength(allRules.length);
    for (const result of analyzed.analysisResults.filter(
      (r) => r.status === "UNKNOWN",
    )) {
      expect(result.riskLevel).toBeNull();
    }
  });

  it("displayRiskLevel：UNKNOWN / null → 暂无法评级；NORMAL+LOW → 低风险", () => {
    expect(displayRiskLevel("UNKNOWN", null)).toBe("暂无法评级");
    expect(displayRiskLevel("UNKNOWN", "LOW")).toBe("暂无法评级"); // 防御式
    expect(displayRiskLevel("NORMAL", "LOW")).toBe("低风险");
    expect(displayRiskLevel("ABNORMAL", "MEDIUM")).toBe("中风险");
    expect(displayRiskLevel("ABNORMAL", "HIGH")).toBe("高风险");
    expect(displayRiskLevel("ABNORMAL", "CRITICAL")).toBe("严重");
  });

  it("UNKNOWN 不参与 LOW 聚合；全 UNKNOWN 不得得到低风险建议", () => {
    const assessment = buildSuggestedAssessment({
      results: [
        {
          ruleId: "X-1",
          category: "DATA",
          status: "UNKNOWN",
          riskLevel: null,
          title: "缺数据",
          explanation: "缺少审计",
          evidenceIds: [],
          verificationActions: ["补充数据"],
        },
        {
          ruleId: "X-2",
          category: "NETWORK",
          status: "UNKNOWN",
          riskLevel: null,
          title: "缺网络",
          explanation: "缺少网络日志",
          evidenceIds: [],
          verificationActions: ["补充网络日志"],
        },
        {
          ruleId: "X-3",
          category: "IDENTITY",
          status: "UNKNOWN",
          riskLevel: null,
          title: "缺身份",
          explanation: "缺少认证日志",
          evidenceIds: [],
          verificationActions: ["补充认证日志"],
        },
      ],
      businessContext: {
        plannedTaskStatus: "UNKNOWN",
        changeTicketStatus: "UNKNOWN",
        changeTicketId: null,
        businessOwner: null,
        ownerVerification: "UNKNOWN",
        businessLegitimacy: "UNKNOWN",
        businessJustification: null,
      },
    });
    expect(assessment.data.status).toBe("UNKNOWN");
    expect(assessment.data.riskLevel).toBeNull();
    expect(assessment.network.riskLevel).toBeNull();
    expect(assessment.identity.riskLevel).toBeNull();
    expect(assessment.suggestedRiskLevel).toBeNull();
    expect(assessment.suggestedRiskLevel).not.toBe("LOW");
    expect(assessment.summary).toMatch(/缺少必要数据|暂无法形成有效研判/);
  });

  it("Case A：Network UNKNOWN 不携带 LOW；人工结论不变", () => {
    const n1 = analyzedA.analysisResults.find((r) => r.ruleId === "NETWORK-001");
    const n2 = analyzedA.analysisResults.find((r) => r.ruleId === "NETWORK-002");
    expect(n1?.status).toBe("UNKNOWN");
    expect(n2?.status).toBe("UNKNOWN");
    expect(n1?.riskLevel).toBeNull();
    expect(n2?.riskLevel).toBeNull();
    expect(analyzedA.suggestedAssessment?.network.status).toBe("UNKNOWN");
    expect(analyzedA.suggestedAssessment?.network.riskLevel).toBeNull();
    expect(analyzedA.dataContext.accessStatus).toBe("ABNORMAL");
    expect(findHighData(analyzedA)).toBe(true);
    expect(analyzedA.businessContext.businessLegitimacy).toBe("AUTHORIZED");
    expect(analyzedA.suggestedAssessment?.suggestedRiskLevel).toBe("LOW");
    expect(caseA.humanReview?.finalConclusion).toBe("NORMAL_BUSINESS");
  });

  it("Case B：结论与建议不变；业务 UNKNOWN；UNKNOWN ≠ LOW", () => {
    expect(caseB.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
    expect(analyzedB.businessContext.businessLegitimacy).toBe("UNKNOWN");
    expect(analyzedB.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
    for (const r of analyzedB.analysisResults.filter(
      (x) => x.status === "UNKNOWN",
    )) {
      expect(r.riskLevel).toBeNull();
    }
  });

  it("Report / DOCX：UNKNOWN 文案正确，不出现 null/undefined/误用低风险", async () => {
    const report = buildReportData({
      securityCase: analyzedA,
      humanReview: analyzedA.humanReview,
      checklist: analyzedA.checklist,
      timeline: analyzedA.timeline,
    });
    const joined = report.sections.map((s) => s.content).join("\n");
    expect(joined).toMatch(/暂缺少相关信息，当前无法判断/);
    expect(joined).toMatch(/暂无法评级/);
    expect(joined).not.toMatch(/\bnull\b|\bundefined\b/i);
    // NETWORK UNKNOWN 行不得写成「低风险」
    expect(joined).toMatch(/【异常公网通信】暂缺少相关信息/);
    expect(joined).not.toMatch(/【异常公网通信】[^：]*低风险/);

    const buffer = await generateDocxBuffer(
      report,
      {
        evidences: analyzedA.evidences,
        timeline: analyzedA.timeline,
      },
      { maskSensitive: true },
    );
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});

function findHighData(
  securityCase: ReturnType<typeof analyzeSecurityCase>,
): boolean {
  return securityCase.analysisResults.some(
    (r) =>
      r.category === "DATA" &&
      r.status === "ABNORMAL" &&
      (r.riskLevel === "HIGH" || r.riskLevel === "CRITICAL"),
  );
}
