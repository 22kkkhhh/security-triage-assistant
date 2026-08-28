/**
 * 领域模型核心类型定义。
 * 与 docs/DOMAIN_MODEL.md 保持一致：
 * - 可能因数据缺失而无法判断的字段一律使用 ObservationStatus（三态），禁止 boolean；
 * - UNKNOWN 表示“当前没有足够数据进行判断”，绝不能解释为“正常”；
 * - 业务核查语义使用专用枚举（ExistenceStatus / VerificationStatus / BusinessLegitimacy），
 *   明确区分“确认存在 / 确认不存在 / 未获取信息”；
 * - 缺失的具体数据字段使用 null 显式建模。
 */

import type { ComplianceReferenceSnapshot } from "./knowledge";
import type { VerificationAction } from "@/services/analysis/verificationActions";

/** 三态判断：未见异常 / 异常或可疑 / 数据不足无法判断 */
export type ObservationStatus = "NORMAL" | "ABNORMAL" | "UNKNOWN";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** 统一安全领域分类 */
export type SecurityDomain = "DATA" | "NETWORK" | "IDENTITY" | "BUSINESS";

/** 某项信息是否被确认存在（确认存在 / 确认不存在 / 未获取信息） */
export type ExistenceStatus = "CONFIRMED" | "NOT_FOUND" | "UNKNOWN";

/** 变更工单核查结果 */
export type ChangeTicketStatus = ExistenceStatus;

/** 人工/负责人确认结果（确认 / 明确否认 / 尚未获取确认） */
export type VerificationStatus = "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";

/** 业务合理性结论（已授权 / 确认未授权 / 尚未判断） */
export type BusinessLegitimacy = "AUTHORIZED" | "UNAUTHORIZED" | "UNKNOWN";

/** 人工最终结论。系统不得自动落定该结论 */
export type FinalConclusion =
  | "NORMAL_BUSINESS"
  | "SUSPECTED_SECURITY_INCIDENT"
  | "INCONCLUSIVE";

/**
 * 案件工作流状态（人工控制，不由风险等级自动强制流转）。
 * 非强制线性审批流，允许合理跳转。
 */
export type CaseStatus =
  | "NEW"
  | "INVESTIGATING"
  | "PENDING_VERIFICATION"
  | "PENDING_BUSINESS_CONFIRMATION"
  | "RESPONDING"
  | "CLOSED";

/** 证据来源类型 */
export type EvidenceSourceType =
  | "DATABASE_AUDIT"
  | "AUTH_LOG"
  | "NETWORK_LOG"
  | "BUSINESS_SYSTEM_LOG"
  | "CHANGE_TICKET"
  | "MANUAL_INPUT";

/** 原始告警信息与标准化字段 */
export interface AlertInfo {
  title: string;
  /** 告警来源系统，如“数据库审计系统” */
  source: string;
  /** 原始告警级别；导入数据未提供时为 null，不得伪造 */
  severity: RiskLevel | null;
  /** 告警发生时间；未提供时为 null */
  occurredAt: string | null;
  description: string;
  /** 原始告警编号，缺失为 null */
  originalAlertId: string | null;
}

/**
 * 历史访问量基线（最小模型）。
 * 仅承载已有/手工提供的历史摘要统计，不做机器学习、不做自动学习基线。
 * 字段为 null 表示未获取该基线数据。
 */
export interface DataBaselineContext {
  averageRecordCount: number | null;
  maxRecordCount: number | null;
  observationDays: number | null;
}

/** 数据安全相关上下文 */
export interface DataContext {
  /** 敏感数据访问是否异常（UNKNOWN = 未获得审计数据） */
  accessStatus: ObservationStatus;
  databaseName: string | null;
  tableName: string | null;
  accessedRecordCount: number | null;
  /** 涉及敏感字段类型（脱敏后的类别名，如“手机号”），不存具体值 */
  sensitiveFieldTypes: string[];
  operationType: string | null;
  /** 是否发生在非工作时间（UNKNOWN = 无法获取时间基准） */
  outsideBusinessHours: ObservationStatus;
  /** 历史访问基线，未提供为 null */
  baseline: DataBaselineContext | null;
  note: string | null;
}

/** 网络上下文 */
export interface NetworkContext {
  networkStatus: ObservationStatus;
  /** 内网来源地址（RFC1918），缺失为 null */
  internalSourceIp: string | null;
  /** 是否存在异常公网通信（UNKNOWN = 未获得网络侧数据） */
  externalCommunication: ObservationStatus;
  /** 外部通信对端（仅允许文档示例段，如 203.0.113.0/24），无则 null */
  externalDestination: string | null;
  /** 出站流量字节数，未获得出口流量数据为 null */
  outboundTransferBytes: number | null;
  note: string | null;
}

/** 身份与行为上下文 */
export interface IdentityContext {
  identityStatus: ObservationStatus;
  /** 虚构演示账号名 */
  accountName: string | null;
  /** 连续失败认证次数，未获得认证日志为 null */
  failedLoginAttempts: number | null;
  /**
   * 告警时间窗内是否出现成功登录（null = 认证日志未提供该事实）。
   * 用于区分“连续失败后成功登录”与“仅有失败记录”。
   */
  successfulLogin: boolean | null;
  /** 是否来自陌生来源登录（UNKNOWN = 无历史基线可比对） */
  loginFromUnseenSource: ObservationStatus;
  /** 登录来源地址（内网/测试地址） */
  loginSourceIp: string | null;
  /** 本次访问涉及的业务系统 */
  accessedSystems: string[];
  note: string | null;
}

/** 业务上下文：计划任务、变更工单、负责人确认、业务合理性 */
export interface BusinessContext {
  /** 是否存在计划任务 */
  plannedTaskStatus: ExistenceStatus;
  /** 变更工单核查结果 */
  changeTicketStatus: ChangeTicketStatus;
  changeTicketId: string | null;
  /** 业务负责人（演示环境使用虚构姓名），未确认为 null */
  businessOwner: string | null;
  /** 负责人确认结果（UNKNOWN = 尚未联系到负责人） */
  ownerVerification: VerificationStatus;
  /** 业务合理性结论 */
  businessLegitimacy: BusinessLegitimacy;
  /** 业务合理性说明 */
  businessJustification: string | null;
}

/**
 * 规则分析结果，必须可追溯到证据与建议核查事项。
 * 领域不变量：status === UNKNOWN 时 riskLevel 必须为 null（不可评级，≠ LOW）。
 */
export interface AnalysisResult {
  ruleId: string;
  category: SecurityDomain;
  status: ObservationStatus;
  /** UNKNOWN 时为 null；NORMAL / ABNORMAL 时为具体等级 */
  riskLevel: RiskLevel | null;
  title: string;
  /** 判断依据与解释；UNKNOWN 时必须说明缺少什么信息、为什么无法判断 */
  explanation: string;
  /** 关联 Evidence.evidenceId */
  evidenceIds: string[];
  /** 建议核查事项（含稳定 actionId + 展示 label） */
  verificationActions: VerificationAction[];
}

/** 可进入报告的证据条目 */
export interface Evidence {
  evidenceId: string;
  /** 生成该证据的规则 ID */
  relatedRuleId: string;
  sourceType: EvidenceSourceType;
  /** 证据对应时间；告警时间缺失时为 null */
  timestamp: string | null;
  title: string;
  /** 证据摘要：必须说明“为什么系统认为该行为异常”，禁止只写“高风险” */
  summary: string;
  /** 研判人员补充说明 */
  analystNote: string | null;
  includedInReport: boolean;
  /** 可选原始告警来源 ID；详情页继续受 CASE_READ/no-store/redaction 保护。 */
  rawAlertId?: string | null;
}

/** Checklist 来源标记（可选；存在 caseState JSON，无 Prisma 表变更） */
export type ChecklistSourceKind =
  | "KNOWLEDGE_SUGGESTED"
  | "SECURITY_VERIFICATION"
  | "INVESTIGATION_LEAD";

/**
 * Checklist provenance 引用（caseState JSON，无 Prisma migration）。
 * Knowledge / Security 使用 suggestionKey 路径；Investigation Lead 使用 leadKey 路径。
 * 字段均为可选以保持历史反序列化兼容。
 */
export type ChecklistSourceRef = {
  /** 调查目标，供工作台直接跳转 Account/IP/System/Evidence/RawAlert。 */
  targetRef?: {
    kind: "ACCOUNT" | "IP" | "SYSTEM" | "EVIDENCE" | "RAW_ALERT";
    value: string;
    navigationTarget?: string;
  };
  /** CaseComplianceChecklistItem.key / security suggestionKey */
  suggestionKey?: string;
  kind?: "CONTEXT" | "EVIDENCE" | "CHECKLIST";
  controlCodes?: string[];
  clauseRefs?: Array<{
    clauseKey: string;
    documentCanonicalCode: string;
  }>;
  relevance?: string;
  /** INVESTIGATION_LEAD：稳定去重 key，如 INVESTIGATION_LEAD:VERIFY_RECURRING_ACCOUNT */
  leadKey?: string;
  /** INVESTIGATION_LEAD：稳定 lead code */
  leadCode?: string;
  /** 添加时固化的关联案件 id 快照 */
  relatedCaseIds?: string[];
  /** 添加时固化的 Historical Signal code 快照 */
  signalCodes?: string[];
};

/** 人工核查清单项 */
export interface ChecklistItem {
  id: string;
  category: SecurityDomain;
  label: string;
  completed: boolean;
  note: string | null;
  /** SYSTEM = 规则自动生成；MANUAL = 人工新增（含合规建议 opt-in） */
  origin: "SYSTEM" | "MANUAL";
  relatedRuleId: string | null;
  /** 可选：来自合规建议时标记；不扩展 origin enum */
  sourceKind?: ChecklistSourceKind;
  sourceRef?: ChecklistSourceRef;
}

/** 处置与研判时间线事件 */
export interface TimelineEvent {
  id: string;
  occurredAt: string;
  /** 事件事实类型，如：告警 / 认证 / 数据访问 / 网络通信 / 系统访问 / 其他（非研判操作） */
  eventType: string;
  title: string;
  description: string;
  /** 操作人；SYSTEM 事件为 null */
  operator: string | null;
  /** SYSTEM = 来自告警/日志；HUMAN = 人工研判或处置记录 */
  source: "SYSTEM" | "HUMAN";
  /** 可选实体/证据引用，旧事件缺失时由 presenter 推导。 */
  relatedEntityRefs?: Array<{ kind: "ACCOUNT" | "IP" | "SYSTEM" | "账号" | "系统"; value: string }>;
  evidenceIds?: string[];
}

/**
 * 人工最终结论与修正。
 *
 * reviewer = 当前最终研判责任人 displayName 快照（Server-owned）
 * reviewedByUserId = 认证责任人 User.id（可选；Legacy 可缺失 / null）
 * 二者仅在 finalConclusion / humanRiskLevel 真实变化时由 Server 写入。
 */
export interface HumanReview {
  /** 当前最终研判责任人 displayName 快照；不随 User 改名自动更新 */
  reviewer: string | null;
  /**
   * 当前最终研判责任人 authenticated User.id。
   * Legacy v1.2 数据可为 missing / null；JSON 引用，无 Prisma FK。
   */
  reviewedByUserId?: string | null;
  finalConclusion: FinalConclusion | null;
  /** 人工认定的风险等级，可与系统建议不同 */
  humanRiskLevel: RiskLevel | null;
  /** 人工结论文本（必须使用“疑似/建议进一步核查”等措辞，系统不得自动下定论） */
  conclusionNote: string | null;
  /** 对系统分析结果的人工修正说明 */
  adjustments: string[];
  confirmedAt: string | null;
}

/** 单维度研判建议：UNKNOWN 时 riskLevel 为 null */
export interface DimensionAssessment {
  status: ObservationStatus;
  riskLevel: RiskLevel | null;
}

/**
 * 系统综合研判建议。与 HumanReview 严格分离：
 * - 只做风险提示与核查建议，不下最终结论；
 * - 禁止三维评分算术平均，禁止输出攻击概率，禁止生成“确认安全事件”类结论。
 */
export interface SuggestedAssessment {
  data: DimensionAssessment;
  network: DimensionAssessment;
  identity: DimensionAssessment;
  businessLegitimacy: BusinessLegitimacy;
  /** 证据完整度：UNKNOWN 结果越多置信度越低 */
  evidenceConfidence: "LOW" | "MEDIUM" | "HIGH";
  /** 建议风险等级；证据不足时为 null */
  suggestedRiskLevel: RiskLevel | null;
  /** 仅允许“疑似 / 存在风险 / 建议核查 / 当前证据显示 / 暂无法排除”等措辞 */
  summary: string;
  recommendedNextActions: string[];
}

/** 报告章节 key（基本信息、研判依据与证据、事件处置过程为结构化表格章节） */
export type ReportSectionKey =
  | "overview"
  | "rawAlert"
  | "dataAnalysis"
  | "networkAnalysis"
  | "identityAnalysis"
  | "businessReview"
  | "evidenceIntro"
  | "checklistSummary"
  | "timelineIntro"
  | "impactAnalysis"
  | "complianceRelevant"
  | "compliancePossible"
  | "complianceFurtherVerification"
  | "conclusion"
  | "recommendations";

/** 可编辑报告章节 */
export interface ReportSection {
  key: ReportSectionKey;
  title: string;
  /** 自动生成的初稿内容，允许人工修改 */
  content: string;
}

/**
 * 报告编辑态与导出内容。
 * - 自动生成内容仅为初稿，最终报告必须允许人工修改；
 * - 结论章节内容来自 HumanReview，不得用 SuggestedAssessment 覆盖；
 * - Evidence / Timeline 以结构化表格进入报告，通过 ID 引用。
 */
export interface ReportData {
  /** 事件名称（可编辑） */
  title: string;
  /** 报告案件编号，如 INC-20260808-001 */
  caseNumber: string;
  /** 基本信息区（标签-内容对，时间已格式化为人类易读格式） */
  basicInfo: { label: string; value: string }[];
  sections: ReportSection[];
  /** 进入报告的证据 ID */
  evidenceIds: string[];
  /** 进入报告的时间线事件 ID */
  timelineEventIds: string[];
  generatedAt: string;
  /**
   * 合规引用 Snapshot（旧草稿可缺失）。
   * DOCX 只消费章节/本字段，不得再查 Knowledge DB 或重选版本。
   */
  complianceReferences?: ComplianceReferenceSnapshot[];
}

/** 一次研判案件的聚合根 */
export interface SecurityCase {
  id: string;
  name: string;
  createdAt: string;
  alert: AlertInfo;
  dataContext: DataContext;
  networkContext: NetworkContext;
  identityContext: IdentityContext;
  businessContext: BusinessContext;
  /** 以下四项由规则分析引擎生成，不允许手工伪造 */
  analysisResults: AnalysisResult[];
  evidences: Evidence[];
  checklist: ChecklistItem[];
  suggestedAssessment: SuggestedAssessment | null;
  /** 尚未人工确认为 null */
  humanReview: HumanReview | null;
  /** 尚未编辑报告为 null */
  report: ReportData | null;
  timeline: TimelineEvent[];
}

/** 规则引擎的输入：尚未生成分析结果的案件草稿 */
export type SecurityCaseDraft = Omit<
  SecurityCase,
  "analysisResults" | "evidences" | "checklist" | "suggestedAssessment"
>;
