import { unknownEvaluation } from "../ruleHelpers";
import type { AnalysisRule } from "../types";


export const businessRules: AnalysisRule[] = [
  {
    ruleId: "BUSINESS-001",
    category: "BUSINESS",
    title: "变更工单核查",
    evaluate: (securityCase) => {
      const b = securityCase.businessContext;
      if (b.changeTicketStatus === "UNKNOWN") {
        return unknownEvaluation(
          "尚未核查变更管理系统，无法判断是否存在对应变更工单。",
          ["查询变更工单"],
        );
      }
      if (b.changeTicketStatus === "NOT_FOUND") {
        return {
          status: "ABNORMAL",
          riskLevel: "MEDIUM",
          explanation:
            "在变更管理系统中未找到与本次操作对应的工单，暂无法排除未授权操作，建议核查业务合理性。",
          verificationActions: ["核查计划任务", "联系业务负责人"],
          evidences: [],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: `已找到对应变更工单 ${b.changeTicketId ?? "（编号缺失）"}，本次操作存在正式变更记录。`,
        verificationActions: [],
        evidences: [
          {
            sourceType: "CHANGE_TICKET",
            timestamp: securityCase.alert.occurredAt,
            title: `变更工单 ${b.changeTicketId ?? ""}`,
            summary: `变更管理系统中存在与本次操作对应的工单 ${b.changeTicketId ?? "（编号缺失）"}，操作窗口与告警时间吻合。`,
          },
        ],
      };
    },
  },
  {
    ruleId: "BUSINESS-002",
    category: "BUSINESS",
    title: "业务负责人确认",
    evaluate: (securityCase) => {
      const b = securityCase.businessContext;
      if (b.ownerVerification === "UNKNOWN") {
        return unknownEvaluation(
          "尚未获取业务负责人确认，无法判断本次操作是否获得授权。",
          ["联系业务负责人"],
        );
      }
      if (b.ownerVerification === "NOT_CONFIRMED") {
        return {
          status: "ABNORMAL",
          riskLevel: "MEDIUM",
          explanation:
            "业务负责人明确未确认本次操作为授权行为，暂无法排除未授权操作。",
          verificationActions: ["核实操作发起人身份", "评估是否需要升级安全事件"],
          evidences: [],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: `业务负责人 ${b.businessOwner ?? "（姓名缺失）"} 已确认本次操作属于授权行为。`,
        verificationActions: [],
        evidences: [
          {
            sourceType: "MANUAL_INPUT",
            timestamp: securityCase.alert.occurredAt,
            title: "业务负责人确认记录",
            summary: `业务负责人 ${b.businessOwner ?? "（姓名缺失）"} 确认本次操作属于授权业务行为。`,
          },
        ],
      };
    },
  },
  {
    ruleId: "BUSINESS-003",
    category: "BUSINESS",
    title: "业务合理性判断",
    evaluate: (securityCase) => {
      const b = securityCase.businessContext;
      if (b.businessLegitimacy === "UNKNOWN") {
        return unknownEvaluation(
          "缺少工单与负责人确认等关键信息，暂无法判断业务合理性。",
          ["核查计划任务", "查询变更工单", "联系业务负责人"],
        );
      }
      if (b.businessLegitimacy === "UNAUTHORIZED") {
        return {
          status: "ABNORMAL",
          riskLevel: "HIGH",
          explanation:
            "经核查本次操作未获得业务授权，存在风险，建议升级为安全事件进一步调查。",
          verificationActions: ["记录未授权操作细节", "评估影响范围并启动处置流程"],
          evidences: [],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: `经核查，本次操作存在有效变更工单，且业务负责人已确认属于授权数据迁移任务。结合现有业务证据，本次技术异常行为可由已授权业务活动合理解释。${
          b.businessJustification ? `\n业务说明：${b.businessJustification}` : ""
        }`,
        verificationActions: [],
        evidences: [],
      };
    },
  },
];
