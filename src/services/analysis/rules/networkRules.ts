import { unknownEvaluation } from "../ruleHelpers";
import type { AnalysisRule } from "../types";
import { EMPTY_VERIFICATION_ACTIONS, VA } from "../verificationActions";

/** 出站流量超过该字节数（100MB）视为异常出站启发式阈值 */
const OUTBOUND_BYTES_THRESHOLD = 100 * 1024 * 1024;

export const networkRules: AnalysisRule[] = [
  {
    ruleId: "NETWORK-001",
    category: "NETWORK",
    title: "异常公网通信",
    evaluate: (securityCase) => {
      const n = securityCase.networkContext;
      if (n.externalCommunication === "UNKNOWN") {
        return unknownEvaluation(
          "当前未获取对应时间段的出口网络通信数据，无法判断是否存在异常公网通信，建议结合防火墙或出口网络日志进一步核查。",
          [VA.fetchEgressNetworkLog],
        );
      }
      if (n.externalCommunication === "ABNORMAL") {
        return {
          status: "ABNORMAL",
          riskLevel: "HIGH",
          explanation: `当前证据显示检测到向 ${n.externalDestination ?? "未知外部地址"} 的持续公网通信，暂无法排除数据外传风险，建议进一步核查通信内容。`,
          verificationActions: [
            VA.fetchEgressNetworkLog,
            VA.verifyExternalCommunicationContent,
          ],
          evidences: [
            {
              sourceType: "NETWORK_LOG",
              timestamp: securityCase.alert.occurredAt,
              title: "出口网关流量日志（脱敏摘录）",
              summary: `检测到自内网向 ${n.externalDestination ?? "未知外部地址"} 的持续公网连接，存在异常公网通信特征。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: "当前证据未见异常公网通信。",
        verificationActions: EMPTY_VERIFICATION_ACTIONS,
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
        return unknownEvaluation(
          "缺少出口流量统计数据（字节数），无法判断出站流量是否异常。",
          [VA.fetchEgressNetworkLog],
        );
      }
      if (n.outboundTransferBytes > OUTBOUND_BYTES_THRESHOLD) {
        const mb = Math.round(n.outboundTransferBytes / 1024 / 1024);
        return {
          status: "ABNORMAL",
          riskLevel: "HIGH",
          explanation: `当前证据显示告警时间窗内出站流量约 ${mb}MB，超过系统固定告警阈值（100MB），存在大量出站传输特征，暂无法排除数据外传风险，建议进一步核查。`,
          verificationActions: [VA.verifyOutboundTrafficDetails],
          evidences: [
            {
              sourceType: "NETWORK_LOG",
              timestamp: securityCase.alert.occurredAt,
              title: "出口流量统计（脱敏摘录）",
              summary: `告警时间窗内累计出站流量约 ${mb}MB，超过固定告警阈值。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: "出站流量处于常规范围内。",
        verificationActions: EMPTY_VERIFICATION_ACTIONS,
        evidences: [],
      };
    },
  },
];
