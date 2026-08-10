import { unknownEvaluation } from "../ruleHelpers";
import type { AnalysisRule } from "../types";
import { EMPTY_VERIFICATION_ACTIONS, VA } from "../verificationActions";

/** 连续失败认证达到该次数，视为高风险 */
const FAILED_LOGIN_HIGH_THRESHOLD = 10;

export const identityRules: AnalysisRule[] = [
  {
    ruleId: "IDENTITY-001",
    category: "IDENTITY",
    title: "非常用来源 IP",
    evaluate: (securityCase) => {
      const i = securityCase.identityContext;
      if (i.loginFromUnseenSource === "UNKNOWN") {
        return unknownEvaluation(
          "缺少该账号的历史登录来源记录，无法判断登录来源是否陌生。",
          [VA.supplementLoginSourceHistory],
        );
      }
      if (i.loginFromUnseenSource === "ABNORMAL") {
        return {
          status: "ABNORMAL",
          riskLevel: "MEDIUM",
          explanation: `登录来源 ${i.loginSourceIp ?? "未知地址"} 此前从未在该账号的登录记录中出现，属于非常用来源。`,
          verificationActions: [
            VA.verifySourceIpOwnership,
            VA.confirmAccountUser,
          ],
          evidences: [
            {
              sourceType: "AUTH_LOG",
              timestamp: securityCase.alert.occurredAt,
              title: "认证日志（脱敏摘录）",
              summary: `账号 ${i.accountName ?? "未知账号"} 自 ${i.loginSourceIp ?? "未知地址"} 登录成功，该地址在此前的登录历史中从未出现。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: "登录来源与该账号历史登录记录一致。",
        verificationActions: EMPTY_VERIFICATION_ACTIONS,
        evidences: [],
      };
    },
  },
  {
    ruleId: "IDENTITY-002",
    category: "IDENTITY",
    title: "连续认证失败后成功登录",
    evaluate: (securityCase) => {
      const i = securityCase.identityContext;
      if (i.failedLoginAttempts === null) {
        return unknownEvaluation(
          "缺少认证日志中的失败次数记录，无法判断是否存在连续失败认证。",
          [VA.supplementAuthLogFailureCount],
        );
      }
      if (i.failedLoginAttempts === 0) {
        return {
          status: "NORMAL",
          riskLevel: "LOW",
          explanation: "登录前无失败认证记录。",
          verificationActions: EMPTY_VERIFICATION_ACTIONS,
          evidences: [],
        };
      }
      const high = i.failedLoginAttempts >= FAILED_LOGIN_HIGH_THRESHOLD;
      return {
        status: "ABNORMAL",
        riskLevel: high ? "HIGH" : "MEDIUM",
        explanation: `账号在成功登录前连续失败认证 ${i.failedLoginAttempts} 次，随后登录成功，疑似凭据被猜测或泄露，建议进一步核查。`,
        verificationActions: [
          VA.contactAccountUser,
          VA.verifyFailedAuthSourceDistribution,
        ],
        evidences: [
          {
            sourceType: "AUTH_LOG",
            timestamp: securityCase.alert.occurredAt,
            title: "认证日志（脱敏摘录）",
            summary: `账号 ${i.accountName ?? "未知账号"} 在成功登录前连续失败认证 ${i.failedLoginAttempts} 次，随后自 ${i.loginSourceIp ?? "未知地址"} 完成成功登录。`,
          },
        ],
      };
    },
  },
  {
    ruleId: "IDENTITY-003",
    category: "IDENTITY",
    title: "短时间访问多个业务系统",
    evaluate: (securityCase) => {
      const i = securityCase.identityContext;
      if (i.accessedSystems.length === 0) {
        return unknownEvaluation(
          "缺少业务系统访问日志，无法判断是否存在跨系统访问行为。",
          [VA.supplementBusinessSystemAccessLogs],
        );
      }
      if (i.accessedSystems.length >= 3) {
        return {
          status: "ABNORMAL",
          riskLevel: "MEDIUM",
          explanation: `同一账号在告警时间窗内先后访问 ${i.accessedSystems.length} 个业务系统（${i.accessedSystems.join("、")}），与该账号历史行为模式不符。`,
          verificationActions: [VA.verifyCrossSystemAccessLogs],
          evidences: [
            {
              sourceType: "BUSINESS_SYSTEM_LOG",
              timestamp: securityCase.alert.occurredAt,
              title: "业务系统访问日志（脱敏摘录）",
              summary: `账号 ${i.accountName ?? "未知账号"} 在短时间内先后访问 ${i.accessedSystems.join("、")}，跨系统访问范围超出其历史行为模式。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: `访问涉及 ${i.accessedSystems.length} 个业务系统，未见异常跨系统访问。`,
        verificationActions: EMPTY_VERIFICATION_ACTIONS,
        evidences: [],
      };
    },
  },
];
