import type {
  ComparisonDiffFieldCode,
  ComparisonFactCategory,
  ComparisonSharedFactCode,
} from "@/services/correlation/caseComparisonTypes";
import { relatedCaseReasonLabels } from "./relatedCaseLabels";

export const comparisonCategoryLabels: Record<ComparisonFactCategory, string> =
  {
    ALERT: "告警",
    IDENTITY: "身份行为",
    NETWORK: "网络",
    DATA: "数据",
    BUSINESS: "业务上下文",
  };

export const comparisonSharedFactLabels: Record<
  ComparisonSharedFactCode,
  string
> = {
  SAME_USERNAME: relatedCaseReasonLabels.SAME_USERNAME,
  SAME_SOURCE_IP: relatedCaseReasonLabels.SAME_SOURCE_IP,
  SHARED_SYSTEM: relatedCaseReasonLabels.SHARED_SYSTEM,
  SAME_EXTERNAL_ALERT_ID: relatedCaseReasonLabels.SAME_EXTERNAL_ALERT_ID,
  SAME_ALERT_SOURCE: relatedCaseReasonLabels.SAME_ALERT_SOURCE,
  SAME_ALERT_SEVERITY: "相同告警级别",
  SAME_ALERT_TIME: "相同告警时间",
  SAME_DATABASE: "相同数据库",
  SAME_TABLE: "相同数据表",
  SAME_OPERATION: "相同操作类型",
  SAME_EXTERNAL_COMMUNICATION: "相同外联状态",
  SAME_EXTERNAL_DESTINATION: "相同外联目标",
  SAME_CHANGE_TICKET: "相同变更工单",
  SAME_BUSINESS_LEGITIMACY: "相同业务合理性结论",
  SAME_PLANNED_TASK_STATUS: "相同计划任务状态",
  SAME_OWNER_VERIFICATION: "相同负责人确认状态",
};

export const comparisonDiffFieldLabels: Record<ComparisonDiffFieldCode, string> =
  {
    USERNAME: "账号",
    SOURCE_IP: "源 IP",
    ACCESSED_SYSTEMS: "涉及业务系统",
    ALERT_SOURCE: "告警来源",
    EXTERNAL_ALERT_ID: "原始告警 ID",
    ALERT_SEVERITY: "告警级别",
    ALERT_TIME: "告警时间",
    EXTERNAL_COMMUNICATION: "外联状态",
    EXTERNAL_DESTINATION: "外联目标",
    INTERNAL_SOURCE_IP: "内网来源 IP",
    DATABASE: "数据库",
    TABLE: "数据表",
    OPERATION: "操作类型",
    ROWS_AFFECTED: "涉及记录数",
    SENSITIVE_DATA_TYPES: "敏感数据类型",
    CHANGE_TICKET_ID: "变更工单号",
    CHANGE_TICKET_STATUS: "变更工单状态",
    PLANNED_TASK_STATUS: "计划任务状态",
    OWNER_VERIFICATION: "负责人确认",
    BUSINESS_LEGITIMACY: "业务合理性",
    BUSINESS_OWNER: "业务负责人",
  };

export const COMPARISON_MISSING_DISPLAY = "暂缺信息";

export const COMPARISON_SAFETY_DISCLAIMER =
  "案件对比基于已记录的调查事实，仅用于辅助人工核查，不表示两个案件属于同一安全事件。";

export const COMPARISON_HISTORY_REVIEW_WARNING =
  "历史案件人工结论，仅供当前调查参考，不自动继承。";
