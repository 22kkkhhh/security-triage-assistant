import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { observationStatusLabels } from "@/domain/labels";
import type { SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  completeChecklistItem,
  createManualChecklistItem,
  editChecklistItemNote,
} from "@/services/checklist/generateChecklist";

const analyzedA = analyzeSecurityCase(caseA);
const analyzedB = analyzeSecurityCase(caseB);

function findResult(
  securityCase: ReturnType<typeof analyzeSecurityCase>,
  ruleId: string,
) {
  const result = securityCase.analysisResults.find((r) => r.ruleId === ruleId);
  if (!result) throw new Error(`缺少规则结果：${ruleId}`);
  return result;
}

describe("UNKNOWN 处理", () => {
  it("缺少必要数据时输出 UNKNOWN 而不是 NORMAL", () => {
    // Case A 未导入出口网络日志，NETWORK-001 / NETWORK-002 必须为 UNKNOWN
    expect(findResult(analyzedA, "NETWORK-001").status).toBe("UNKNOWN");
    expect(findResult(analyzedA, "NETWORK-002").status).toBe("UNKNOWN");
    expect(findResult(analyzedA, "NETWORK-001").explanation).toMatch(
      /未获取对应时间段的出口网络通信数据/,
    );
    // Case B 尚未获取负责人确认，BUSINESS-002/003 必须为 UNKNOWN
    expect(findResult(analyzedB, "BUSINESS-002").status).toBe("UNKNOWN");
    expect(findResult(analyzedB, "BUSINESS-003").status).toBe("UNKNOWN");
  });

  it("UNKNOWN 结果必须说明缺少什么信息并给出补充建议", () => {
    for (const securityCase of [analyzedA, analyzedB]) {
      const unknownResults = securityCase.analysisResults.filter(
        (r) => r.status === "UNKNOWN",
      );
      expect(unknownResults.length).toBeGreaterThan(0);
      for (const result of unknownResults) {
        expect(result.explanation).toMatch(/缺少|尚未|无法判断/);
        expect(result.verificationActions.length).toBeGreaterThan(0);
      }
    }
  });

  it("缺失网络信息时生成 UNKNOWN 并产生对应核查项", () => {
    const draft: SecurityCaseDraft = {
      ...caseB,
      id: "test-missing-network",
      networkContext: {
        ...caseB.networkContext,
        externalCommunication: "UNKNOWN",
        externalDestination: null,
        outboundTransferBytes: null,
      },
    };
    const analyzed = analyzeSecurityCase(draft);
    expect(findResult(analyzed, "NETWORK-001").status).toBe("UNKNOWN");
    expect(findResult(analyzed, "NETWORK-002").status).toBe("UNKNOWN");
    expect(
      analyzed.checklist.some((item) =>
        item.label.includes("防火墙/出口网络日志"),
      ),
    ).toBe(true);
  });
});

describe("历史基线（DATA-002）", () => {
  it("有基线时能正确判断偏离并给出偏离倍数", () => {
    const result = findResult(analyzedB, "DATA-002");
    expect(result.status).toBe("ABNORMAL");
    expect(result.riskLevel).toBe("HIGH");
    // 182391 / 14820 ≈ 12.3 倍
    expect(result.explanation).toMatch(/12\.3 倍/);
    expect(result.explanation).toMatch(/14,820/);
    expect(result.evidenceIds.length).toBeGreaterThan(0);
  });

  it("无基线时仍输出 UNKNOWN 并说明缺少的信息", () => {
    const draft: SecurityCaseDraft = {
      ...caseB,
      id: "test-no-baseline",
      dataContext: { ...caseB.dataContext, baseline: null },
    };
    const analyzed = analyzeSecurityCase(draft);
    const result = findResult(analyzed, "DATA-002");
    expect(result.status).toBe("UNKNOWN");
    expect(result.explanation).toMatch(/基线/);
    expect(result.verificationActions.length).toBeGreaterThan(0);
  });
});

describe("Case A：技术异常但业务授权", () => {
  it("技术维度保留异常，同时保留授权业务上下文", () => {
    expect(findResult(analyzedA, "DATA-001").status).toBe("ABNORMAL");
    expect(findResult(analyzedA, "DATA-002").status).toBe("ABNORMAL");
    expect(findResult(analyzedA, "DATA-003").status).toBe("ABNORMAL");
    expect(findResult(analyzedA, "BUSINESS-001").status).toBe("NORMAL");
    expect(findResult(analyzedA, "BUSINESS-002").status).toBe("NORMAL");
    expect(analyzedA.businessContext.changeTicketId).toBe("CHG-20260808-003");
    expect(analyzedA.businessContext.businessLegitimacy).toBe("AUTHORIZED");
  });

  it("系统建议降低风险并提示业务合法上下文", () => {
    const assessment = analyzedA.suggestedAssessment;
    expect(assessment).not.toBeNull();
    expect(assessment?.suggestedRiskLevel).toBe("LOW");
    expect(assessment?.summary).toMatch(/授权/);
  });

  it("业务上下文已确认的核查事项自动标记为已完成", () => {
    const byLabel = new Map(analyzedA.checklist.map((item) => [item.label, item]));
    for (const label of ["核查计划任务", "查询变更工单", "联系业务负责人"]) {
      const item = byLabel.get(label);
      expect(item, `缺少核查项：${label}`).toBeDefined();
      expect(item?.completed).toBe(true);
    }
    // 仍需技术核查的事项保持未完成
    expect(
      byLabel.get("确认数据是否被导出及去向")?.completed,
    ).toBe(false);
  });

  it("Case A 各规则独立生成出口网络日志核查项（同 label、不同 ruleId）", () => {
    const egressItems = analyzedA.checklist.filter((item) =>
      item.label.includes("出口网络日志"),
    );
    expect(egressItems.length).toBe(2);
    const suggestionKeys = egressItems.map((item) => item.sourceRef?.suggestionKey);
    expect(new Set(suggestionKeys).size).toBe(2);
  });

  it("修改业务上下文后 SuggestedAssessment 正确变化", () => {
    const draft: SecurityCaseDraft = {
      ...caseA,
      id: "test-case-a-unauthorized",
      businessContext: {
        ...caseA.businessContext,
        plannedTaskStatus: "NOT_FOUND",
        changeTicketStatus: "NOT_FOUND",
        changeTicketId: null,
        ownerVerification: "NOT_CONFIRMED",
        businessLegitimacy: "UNAUTHORIZED",
      },
    };
    const analyzed = analyzeSecurityCase(draft);
    const assessment = analyzed.suggestedAssessment;
    // 业务授权被否定后，系统建议应回到技术维度的最高风险
    expect(assessment?.suggestedRiskLevel).toBe("HIGH");
    expect(assessment?.summary).not.toMatch(/已确认该行为获得授权/);
    expect(findResult(analyzed, "BUSINESS-003").status).toBe("ABNORMAL");
  });
});

describe("Case B：多维关联异常", () => {
  it("命中多条关联规则", () => {
    const abnormalRuleIds = analyzedB.analysisResults
      .filter((r) => r.status === "ABNORMAL")
      .map((r) => r.ruleId);
    for (const ruleId of [
      "IDENTITY-001",
      "IDENTITY-002",
      "IDENTITY-003",
      "DATA-001",
      "DATA-002",
      "DATA-003",
      "NETWORK-001",
      "NETWORK-002",
      "BUSINESS-001",
    ]) {
      expect(abnormalRuleIds).toContain(ruleId);
    }
  });

  it("系统建议保持 HIGH 并建议升级进一步安全调查，但不生成确认攻击结论", () => {
    const assessment = analyzedB.suggestedAssessment;
    expect(assessment?.suggestedRiskLevel).toBe("HIGH");
    expect(assessment?.summary).toMatch(/建议升级进一步安全调查/);
    expect(assessment?.summary).toMatch(/疑似|存在风险|建议核查|当前证据显示/);
  });

  it("业务合理性 UNKNOWN 不得被描述为“异常”", () => {
    const summary = analyzedB.suggestedAssessment?.summary ?? "";
    expect(analyzedB.businessContext.businessLegitimacy).toBe("UNKNOWN");
    expect(summary).toMatch(/业务合理性尚未确认/);
    expect(summary).not.toMatch(/业务合理性[^，。]*异常/);
  });
});

describe("Evidence 关联", () => {
  it("每条证据都能关联到存在的规则，且说明异常原因", () => {
    for (const securityCase of [analyzedA, analyzedB]) {
      const ruleIds = new Set(securityCase.analysisResults.map((r) => r.ruleId));
      for (const evidence of securityCase.evidences) {
        expect(ruleIds.has(evidence.relatedRuleId)).toBe(true);
        expect(evidence.summary.length).toBeGreaterThan(0);
        expect(evidence.summary).not.toBe("高风险");
      }
      // ABNORMAL 且涉及技术维度的规则必须至少关联一条证据
      const abnormalWithoutEvidence = securityCase.analysisResults.filter(
        (r) =>
          r.status === "ABNORMAL" &&
          r.category !== "BUSINESS" &&
          r.evidenceIds.length === 0,
      );
      expect(abnormalWithoutEvidence).toEqual([]);
    }
  });
});

describe("Checklist", () => {
  it("自动生成的核查清单 suggestionKey 不重复", () => {
    for (const securityCase of [analyzedA, analyzedB]) {
      const keys = securityCase.checklist
        .map((item) => item.sourceRef?.suggestionKey ?? item.id)
        .filter(Boolean);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("支持完成、编辑与人工新增", () => {
    const [first] = analyzedB.checklist;
    expect(first.completed).toBe(false);
    const completed = completeChecklistItem(first, "已核实");
    expect(completed.completed).toBe(true);
    expect(completed.note).toBe("已核实");

    const edited = editChecklistItemNote(first, "等待网关日志");
    expect(edited.note).toBe("等待网关日志");

    const manual = createManualChecklistItem({
      category: "IDENTITY",
      label: "核查账号权限范围",
    });
    expect(manual.origin).toBe("MANUAL");
    expect(manual.completed).toBe(false);
  });
});

describe("人工结论保护", () => {
  it("SuggestedAssessment 不覆盖 HumanReview", () => {
    expect(analyzedA.humanReview).toEqual(caseA.humanReview);
    expect(analyzedB.humanReview).toEqual(caseB.humanReview);
    expect(analyzedA.suggestedAssessment).not.toBe(analyzedA.humanReview);
  });

  it("规则引擎不能产生“确认攻击”类结论", () => {
    const forbidden =
      /确认(遭到)?(黑客)?攻击|已被攻破|已失陷|已发生(数据)?泄露|CONFIRMED.*INCIDENT/;
    for (const securityCase of [analyzedA, analyzedB]) {
      for (const result of securityCase.analysisResults) {
        expect(result.explanation).not.toMatch(forbidden);
        expect(result.title).not.toMatch(forbidden);
      }
      const summary = securityCase.suggestedAssessment?.summary ?? "";
      expect(summary).not.toMatch(forbidden);
      // 系统建议只允许 RiskLevel 或 null，不存在“确认安全事件”取值
      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL", null]).toContain(
        securityCase.suggestedAssessment?.suggestedRiskLevel ?? null,
      );
    }
  });
});

describe("UI 展示约束", () => {
  it("UNKNOWN 与 NORMAL 的展示文案必须明确区分", () => {
    expect(observationStatusLabels.UNKNOWN).not.toBe(
      observationStatusLabels.NORMAL,
    );
    expect(observationStatusLabels.UNKNOWN).toMatch(/无法判断/);
    expect(observationStatusLabels.UNKNOWN).not.toMatch(/未见异常/);
  });
});
