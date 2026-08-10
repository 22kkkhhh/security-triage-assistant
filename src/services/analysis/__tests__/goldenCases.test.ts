import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type { SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";

function findResult(
  analyzed: ReturnType<typeof analyzeSecurityCase>,
  ruleId: string,
) {
  const result = analyzed.analysisResults.find((r) => r.ruleId === ruleId);
  if (!result) throw new Error(`缺少规则结果：${ruleId}`);
  return result;
}

function baseDraft(overrides: Partial<SecurityCaseDraft> = {}): SecurityCaseDraft {
  return {
    ...caseB,
    id: "golden-base",
    humanReview: null,
    timeline: [],
    ...overrides,
  };
}

const forbiddenOverclaim =
  /已泄露|已攻击|已失陷|确认外传|明显偏离历史|与该账号历史行为模式不符|随后成功登录.*未显示成功|全网最低/;

describe("Golden Cases — 规则准确度基线", () => {
  it("GC-01 明确正常业务：授权上下文 + 无技术异常信号", () => {
    const draft = baseDraft({
      id: "gc-01",
      dataContext: {
        ...caseB.dataContext,
        accessedRecordCount: 1200,
        sensitiveFieldTypes: ["姓名"],
        outsideBusinessHours: "NORMAL",
        baseline: {
          averageRecordCount: 1000,
          maxRecordCount: 1500,
          observationDays: 7,
        },
      },
      networkContext: {
        ...caseB.networkContext,
        externalCommunication: "NORMAL",
        outboundTransferBytes: 1024,
      },
      identityContext: {
        ...caseB.identityContext,
        failedLoginAttempts: 0,
        successfulLogin: true,
        loginFromUnseenSource: "NORMAL",
        accessedSystems: ["CRM_PROD"],
      },
      businessContext: {
        ...caseA.businessContext,
      },
    });
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBe("LOW");
    expect(analyzed.analysisResults.every((r) => r.status !== "UNKNOWN" || r.riskLevel === null)).toBe(true);
  });

  it("GC-02 明确异常：大量敏感数据访问", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const data001 = findResult(analyzed, "DATA-001");
    expect(data001.status).toBe("ABNORMAL");
    expect(data001.riskLevel).toBe("HIGH");
    expect(analyzed.suggestedAssessment?.data.status).toBe("ABNORMAL");
  });

  it("GC-03 明确异常：失败认证后成功登录", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const id002 = findResult(analyzed, "IDENTITY-002");
    expect(id002.status).toBe("ABNORMAL");
    expect(id002.explanation).toMatch(/随后出现成功登录/);
    expect(id002.explanation).not.toMatch(/未显示随后成功登录/);
  });

  it("GC-04 明确异常：公网通信 + 大量出站", () => {
    const analyzed = analyzeSecurityCase(caseB);
    expect(findResult(analyzed, "NETWORK-001").status).toBe("ABNORMAL");
    expect(findResult(analyzed, "NETWORK-002").status).toBe("ABNORMAL");
    expect(findResult(analyzed, "NETWORK-002").explanation).toMatch(/固定告警阈值/);
    expect(findResult(analyzed, "NETWORK-002").explanation).not.toMatch(/常规业务出站基线/);
  });

  it("GC-05 极度缺数据 → UNKNOWN，不得 LOW 建议", () => {
    const draft = baseDraft({
      id: "gc-05",
      dataContext: {
        ...caseB.dataContext,
        accessedRecordCount: null,
        sensitiveFieldTypes: [],
        baseline: null,
        outsideBusinessHours: "UNKNOWN",
      },
      networkContext: {
        ...caseB.networkContext,
        externalCommunication: "UNKNOWN",
        outboundTransferBytes: null,
      },
      identityContext: {
        ...caseB.identityContext,
        failedLoginAttempts: null,
        successfulLogin: null,
        loginFromUnseenSource: "UNKNOWN",
        accessedSystems: [],
      },
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
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBeNull();
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).not.toBe("LOW");
    expect(analyzed.analysisResults.filter((r) => r.status === "UNKNOWN").length).toBeGreaterThan(0);
  });

  it("GC-06 大访问量但敏感字段未知 → 不得假 NORMAL", () => {
    const draft = baseDraft({
      id: "gc-06",
      dataContext: {
        ...caseB.dataContext,
        accessedRecordCount: 150_000,
        sensitiveFieldTypes: [],
      },
    });
    const analyzed = analyzeSecurityCase(draft);
    expect(findResult(analyzed, "DATA-001").status).toBe("UNKNOWN");
    expect(findResult(analyzed, "DATA-001").status).not.toBe("NORMAL");
  });

  it("GC-07 失败认证但未成功登录 → 不得描述随后成功", () => {
    const draft = baseDraft({
      id: "gc-07",
      identityContext: {
        ...caseB.identityContext,
        failedLoginAttempts: 8,
        successfulLogin: false,
      },
    });
    const analyzed = analyzeSecurityCase(draft);
    const id002 = findResult(analyzed, "IDENTITY-002");
    expect(id002.status).toBe("ABNORMAL");
    expect(id002.explanation).not.toMatch(/随后出现成功登录|随后登录成功/);
    expect(id002.explanation).toMatch(/未显示随后成功登录/);
  });

  it("GC-08 多系统访问无历史基线 → 不得写偏离历史", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const id003 = findResult(analyzed, "IDENTITY-003");
    expect(id003.explanation).not.toMatch(/历史行为模式|偏离历史/);
    expect(id003.explanation).toMatch(/建议核查是否符合账号职责/);
  });

  it("GC-09 技术异常 + UNKNOWN business → 不得 LOW", () => {
    const analyzed = analyzeSecurityCase(caseB);
    expect(analyzed.businessContext.businessLegitimacy).toBe("UNKNOWN");
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).not.toBe("LOW");
  });

  it("GC-10 技术异常 + AUTHORIZED → 单维 HIGH 不得无条件 LOW", () => {
    const analyzed = analyzeSecurityCase(caseA);
    expect(analyzed.businessContext.businessLegitimacy).toBe("AUTHORIZED");
    expect(findResult(analyzed, "DATA-001").status).toBe("ABNORMAL");
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBe("MEDIUM");
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).not.toBe("LOW");
    expect(analyzed.suggestedAssessment?.summary).toMatch(/授权|核实技术风险/);
  });

  it("GC-11 多维 HIGH + AUTHORIZED → 不得无条件 LOW", () => {
    const draft = baseDraft({
      id: "gc-11",
      businessContext: { ...caseA.businessContext },
    });
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).not.toBe("LOW");
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBe("MEDIUM");
    expect(analyzed.suggestedAssessment?.summary).toMatch(/多个维度|核实技术风险/);
  });

  it("GC-12 UNAUTHORIZED → 风险建议不被 NORMAL 项稀释", () => {
    const draft = baseDraft({
      id: "gc-12",
      businessContext: {
        ...caseB.businessContext,
        businessLegitimacy: "UNAUTHORIZED",
        ownerVerification: "NOT_CONFIRMED",
      },
    });
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
    expect(analyzed.suggestedAssessment?.summary).toMatch(/未获授权/);
  });

  it("GC-13 NORMAL/UNKNOWN 混合 → UNKNOWN 不被 NORMAL 吞掉", () => {
    const draft = baseDraft({
      id: "gc-13",
      networkContext: {
        ...caseB.networkContext,
        externalCommunication: "UNKNOWN",
        outboundTransferBytes: null,
      },
    });
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.suggestedAssessment?.network.status).toBe("UNKNOWN");
    expect(analyzed.suggestedAssessment?.network.riskLevel).toBeNull();
    expect(findResult(analyzed, "NETWORK-001").status).toBe("UNKNOWN");
  });

  it("GC-14 humanReview 存在 → analyze 不覆盖人工结论", () => {
    const analyzed = analyzeSecurityCase(caseA);
    expect(analyzed.humanReview).toEqual(caseA.humanReview);
    expect(analyzed.humanReview?.finalConclusion).toBe("NORMAL_BUSINESS");
  });

  it("GC-15 多维异常：敏感访问 + 公网通信由独立规则分别命中", () => {
    const analyzed = analyzeSecurityCase(caseB);
    expect(findResult(analyzed, "DATA-001").status).toBe("ABNORMAL");
    expect(findResult(analyzed, "NETWORK-001").status).toBe("ABNORMAL");
  });

  it("GC-16 多维异常：认证异常 + 跨系统访问由独立规则分别命中", () => {
    const analyzed = analyzeSecurityCase(caseB);
    expect(findResult(analyzed, "IDENTITY-002").status).toBe("ABNORMAL");
    expect(findResult(analyzed, "IDENTITY-003").status).toBe("ABNORMAL");
  });

  it("GC-17 规则解释不得无证据过度断言", () => {
    for (const securityCase of [analyzeSecurityCase(caseA), analyzeSecurityCase(caseB)]) {
      for (const result of securityCase.analysisResults) {
        expect(result.explanation).not.toMatch(forbiddenOverclaim);
      }
      expect(securityCase.suggestedAssessment?.summary ?? "").not.toMatch(forbiddenOverclaim);
    }
  });

  it("GC-18 successfulLogin 缺失时 IDENTITY-002 为 UNKNOWN", () => {
    const draft = baseDraft({
      id: "gc-18",
      identityContext: {
        ...caseB.identityContext,
        failedLoginAttempts: 5,
        successfulLogin: null,
      },
    });
    const analyzed = analyzeSecurityCase(draft);
    expect(findResult(analyzed, "IDENTITY-002").status).toBe("UNKNOWN");
  });
});
