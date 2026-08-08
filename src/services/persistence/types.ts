import type {
  AlertInfo,
  BusinessContext,
  CaseStatus,
  ChecklistItem,
  DataContext,
  FinalConclusion,
  HumanReview,
  IdentityContext,
  NetworkContext,
  ReportData,
  RiskLevel,
  TimelineEvent,
} from "@/domain/types";

/**
 * 案件可恢复状态（单一 Source of Truth）。
 * AnalysisResult / SuggestedAssessment / Evidence 为确定性派生结果，
 * 恢复后重新计算，不持久化为第二套分析状态。
 */
export interface PersistedCaseState {
  caseData: {
    name: string;
    createdAt: string;
    alert: AlertInfo;
    dataContext: DataContext;
    networkContext: NetworkContext;
    identityContext: IdentityContext;
  };
  businessContext: BusinessContext;
  checklist: ChecklistItem[];
  humanReview: HumanReview | null;
  timeline: TimelineEvent[];
}

/** 创建案件时的输入 */
export interface CreateCaseInput {
  draft: {
    name: string;
    createdAt: string;
    alert: AlertInfo;
    dataContext: DataContext;
    networkContext: NetworkContext;
    identityContext: IdentityContext;
    businessContext: BusinessContext;
    humanReview: HumanReview | null;
    timeline: TimelineEvent[];
  };
  checklist: ChecklistItem[];
  suggestedRiskLevel: RiskLevel | null;
  status?: CaseStatus;
}

/** 更新案件可恢复状态时的输入 */
export interface SaveCaseStateInput {
  caseData: PersistedCaseState["caseData"];
  businessContext: BusinessContext;
  checklist: ChecklistItem[];
  humanReview: HumanReview | null;
  timeline: TimelineEvent[];
  suggestedRiskLevel: RiskLevel | null;
  status?: CaseStatus;
  /**
   * 乐观并发：客户端上次已知 updatedAt。
   * 若库中 updatedAt 更新，拒绝写入，防止 stale autosave 覆盖语义命令结果。
   */
  baseUpdatedAt?: string | null;
}

/** 领域层案件视图（不含派生分析结果） */
export interface PersistedCase {
  id: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  suggestedRiskLevel: RiskLevel | null;
  humanRiskLevel: RiskLevel | null;
  humanConclusion: FinalConclusion | null;
  username: string | null;
  sourceIp: string | null;
  systemsSearchText: string | null;
  pendingChecklistCount: number;
  hasReport: boolean;
  /** 报告草稿最后写入时间；案件编辑不更新 */
  reportUpdatedAt: string | null;
  /** 最后一次有意义的运营活动时间（Audit 成功写入时更新） */
  lastActivityAt: string;
  caseState: PersistedCaseState;
  reportDraft: ReportData | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** 历史案件列表项 */
export interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  suggestedRiskLevel: RiskLevel | null;
  humanRiskLevel: RiskLevel | null;
  humanConclusion: FinalConclusion | null;
  username: string | null;
  sourceIp: string | null;
  systemsSearchText: string | null;
  pendingChecklistCount: number;
  hasReport: boolean;
  reportUpdatedAt: string | null;
  /** 最后一次有意义的运营活动时间 */
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ListCasesQuery {
  /** 搜索案件编号 / 事件名称 / 账号 / IP / 系统 */
  search?: string;
  status?: CaseStatus;
  /** 按人工风险等级筛选；无人工等级时回退建议等级 */
  riskLevel?: RiskLevel;
}
