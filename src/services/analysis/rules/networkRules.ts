import type { AnalysisRule, RuleEvaluation } from "../types";

/** 出站流量超过该字节数（100MB）视为异常出站 */
const OUTBOUND_BYTES_THRESHOLD = 100 * 1024 * 1024;

/** 出口网络核查项统一文案：NETWORK-001 / NETWORK-002 共用，避免生成近义重复核查项 */
const FETCH_EGRESS_LOG_ACTION = "获取对应时间段防火墙/出口网络日志及流量统计信息";

function unknown(
  explanation: string,
  verificationActions: string[],
): RuleEvaluation {
  return {
    status: "UNKNOWN",
    riskLevel: "LOW",
    explanation,
    verificationActions,
    evidences: [],
  };
}

export const networkRules: AnalysisRule[] = [
  {
    ruleId: "NETWORK-001",
    category: "NETWORK",
    title: "异常公网通信",
    evaluate: (securityCase) => {
      const n = securityCase.networkContext;
      if (n.externalCommunication === "UNKNOWN") {
        return unknown(
          "当前未获取对应时间段的出口网络通信数据，无法判断是否存在异常公网通信，建议结合防火墙或出口网络日志进一步核查。",
          [FETCH_EGRESS_LOG_ACTION],
        );
      }
      if (n.externalCommunication === "ABNORMAL") {
        return {
          status: "ABNORMAL",
          riskLevel: "HIGH",
          explanation: `检测到向 ${n.externalDestination ?? "未知外部地址"} 的持续公网通信，暂无法排除数据外传风险，建议进一步核查通信内容。`,
          verificationActions: [
            FETCH_EGRESS_LOG_ACTION,
            "核查通信对端地址归属与通信内容",
          ],
          evidences: [
            {
              sourceType: "NETWORK_LOG",
              timestamp: securityCase.alert.occurredAt,
              title: "出口网关流量日志（脱敏摘录）",
              summary: `检测到自内网向 ${n.externalDestination ?? "未知外部地址"} 的持续公网连接，与常规业务外联基线不符。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: "未发现异常公网通信。",
        verificationActions: [],
        evidences: [],
      };
    },
  },
  {
    ruleId: "NETWORK-002",
    category: "NETWORK",
    title: "异常出站流量",
    evaluate: (securityCase) => {
      const n = securityCase.networkContext;
      if (n.outboundTransferBytes === null) {
        return unknown(
          "缺少出口流量统计数据（字节数），无法判断出站流量是否异常。",
          [FETCH_EGRESS_LOG_ACTION],
        );
      }
      if (n.outboundTransferBytes > OUTBOUND_BYTES_THRESHOLD) {
        const mb = Math.round(n.outboundTransferBytes / 1024 / 1024);
        return {
          status: "ABNORMAL",
          riskLevel: "HIGH",
          explanation: `告警时间窗内出站流量约 ${mb}MB，明显超出常规业务出站基线，暂无法排除数据外传风险。`,
          verificationActions: ["核查出站流量的目的地、协议与会话内容"],
          evidences: [
            {
              sourceType: "NETWORK_LOG",
              timestamp: securityCase.alert.occurredAt,
              title: "出口流量统计（脱敏摘录）",
              summary: `告警时间窗内累计出站流量约 ${mb}MB，明显超出常规业务出站基线。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: "出站流量处于常规范围内。",
        verificationActions: [],
        evidences: [],
      };
    },
  },
];
