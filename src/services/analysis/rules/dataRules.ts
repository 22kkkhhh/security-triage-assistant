import type { AnalysisRule, RuleEvaluation } from "../types";

/** 单次查询超过该记录数且涉及敏感字段，视为大批量敏感数据访问 */
const LARGE_QUERY_THRESHOLD = 100_000;

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

export const dataRules: AnalysisRule[] = [
  {
    ruleId: "DATA-001",
    category: "DATA",
    title: "大批量敏感数据访问",
    evaluate: (securityCase) => {
      const d = securityCase.dataContext;
      if (d.accessedRecordCount === null) {
        return unknown(
          "缺少数据库审计返回行数，无法判断是否存在大批量敏感数据访问。",
          ["补充对应时间段的数据库审计日志（含返回行数与涉及字段）"],
        );
      }
      const isLarge =
        d.accessedRecordCount >= LARGE_QUERY_THRESHOLD &&
        d.sensitiveFieldTypes.length > 0;
      if (!isLarge) {
        return {
          status: "NORMAL",
          riskLevel: "LOW",
          explanation: `查询返回 ${d.accessedRecordCount} 行，未达大批量阈值，未见大批量敏感数据访问。`,
          verificationActions: [],
          evidences: [],
        };
      }
      return {
        status: "ABNORMAL",
        riskLevel: "HIGH",
        explanation: `单次查询返回 ${d.accessedRecordCount.toLocaleString()} 行，涉及敏感字段（${d.sensitiveFieldTypes.join("、")}），明显超出常规业务查询量级，存在批量敏感数据暴露风险。`,
        verificationActions: [
          "核查计划任务",
          "查询变更工单",
          "联系业务负责人",
          "确认数据是否被导出及去向",
        ],
        evidences: [
          {
            sourceType: "DATABASE_AUDIT",
            timestamp: securityCase.alert.occurredAt,
            title: "数据库审计日志（脱敏摘录）",
            summary: `${d.databaseName ?? "未知库"}.${d.tableName ?? "未知表"} 单次查询返回 ${d.accessedRecordCount.toLocaleString()} 行，涉及敏感字段：${d.sensitiveFieldTypes.join("、")}，量级明显超出常规业务查询。`,
          },
        ],
      };
    },
  },
  {
    ruleId: "DATA-002",
    category: "DATA",
    title: "明显偏离历史访问基线",
    evaluate: (securityCase) => {
      const d = securityCase.dataContext;
      const baseline = d.baseline;
      if (
        d.accessedRecordCount === null ||
        baseline === null ||
        baseline.averageRecordCount === null ||
        baseline.averageRecordCount <= 0
      ) {
        return unknown(
          "缺少历史访问基线数据（平均访问量）或本次访问记录数，无法判断是否偏离基线。",
          ["补充该账号及来源地址的历史访问基线数据后重新评估"],
        );
      }
      const ratio = d.accessedRecordCount / baseline.averageRecordCount;
      const daysText =
        baseline.observationDays === null
          ? "历史"
          : `历史 ${baseline.observationDays} 日`;
      const maxText =
        baseline.maxRecordCount !== null &&
        d.accessedRecordCount > baseline.maxRecordCount
          ? `，并超过历史单日最大值 ${baseline.maxRecordCount.toLocaleString()} 行`
          : "";
      const baseEvidence = {
        sourceType: "DATABASE_AUDIT" as const,
        timestamp: securityCase.alert.occurredAt,
        title: "历史访问基线对比（脱敏摘录）",
        summary: `${daysText}平均访问量为 ${baseline.averageRecordCount.toLocaleString()} 行，本次访问 ${d.accessedRecordCount.toLocaleString()} 行，偏离约 ${ratio.toFixed(1)} 倍${maxText}。`,
      };
      if (ratio >= 5) {
        return {
          status: "ABNORMAL",
          riskLevel: "HIGH",
          explanation: `${baseEvidence.summary} 偏离幅度达到高风险阈值，存在批量敏感数据暴露风险。`,
          verificationActions: ["核查计划任务", "查询变更工单", "联系业务负责人"],
          evidences: [baseEvidence],
        };
      }
      if (ratio >= 2) {
        return {
          status: "ABNORMAL",
          riskLevel: "MEDIUM",
          explanation: `${baseEvidence.summary} 偏离幅度超出常规波动范围，建议核查业务背景。`,
          verificationActions: ["核查计划任务", "联系业务负责人"],
          evidences: [baseEvidence],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: `${baseEvidence.summary} 处于常规波动范围内。`,
        verificationActions: [],
        evidences: [],
      };
    },
  },
  {
    ruleId: "DATA-003",
    category: "DATA",
    title: "非工作时间敏感数据访问",
    evaluate: (securityCase) => {
      const d = securityCase.dataContext;
      if (d.outsideBusinessHours === "UNKNOWN") {
        return unknown(
          "缺少工作时间基准或审计时间戳，无法判断是否发生在非工作时间。",
          ["确认企业工作时间口径，并补充审计日志时间戳"],
        );
      }
      if (d.outsideBusinessHours === "ABNORMAL") {
        const timeText = securityCase.alert.occurredAt ?? "（时间未知）";
        return {
          status: "ABNORMAL",
          riskLevel: "MEDIUM",
          explanation: `敏感数据访问发生在非工作时间（${timeText}），与常规业务操作时间不符。`,
          verificationActions: ["核查是否存在夜间计划任务或值班操作安排"],
          evidences: [
            {
              sourceType: "DATABASE_AUDIT",
              timestamp: securityCase.alert.occurredAt,
              title: "审计时间戳（脱敏摘录）",
              summary: `敏感数据访问发生于 ${timeText}，处于非工作时间窗口。`,
            },
          ],
        };
      }
      return {
        status: "NORMAL",
        riskLevel: "LOW",
        explanation: "敏感数据访问发生在工作时间内。",
        verificationActions: [],
        evidences: [],
      };
    },
  },
];
