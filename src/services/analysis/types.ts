import type {
  EvidenceSourceType,
  ObservationStatus,
  RiskLevel,
  SecurityCaseDraft,
  SecurityDomain,
} from "@/domain/types";

/** 规则命中/UNKNOWN 时产出的证据草稿，证据 ID 由引擎统一分配 */
export interface RuleEvidenceDraft {
  sourceType: EvidenceSourceType;
  /** 告警时间缺失时为 null */
  timestamp: string | null;
  title: string;
  /** 必须说明“为什么系统认为该行为异常”或“缺少什么信息” */
  summary: string;
}

/** 单条规则的求值输出；UNKNOWN 时 riskLevel 必须为 null */
export interface RuleEvaluation {
  status: ObservationStatus;
  riskLevel: RiskLevel | null;
  /** 判断依据；UNKNOWN 时必须说明缺少什么信息、为什么无法判断 */
  explanation: string;
  /** 建议核查事项；UNKNOWN 时必须包含建议补充的数据 */
  verificationActions: string[];
  evidences: RuleEvidenceDraft[];
}

/**
 * V1 静态规则：纯 TypeScript 实现，无规则 DSL、无配置后台、无数据库动态规则。
 * evaluate 必须为纯函数，只读取案件草稿中的上下文。
 */
export interface AnalysisRule {
  ruleId: string;
  category: SecurityDomain;
  title: string;
  evaluate: (securityCase: SecurityCaseDraft) => RuleEvaluation;
}
