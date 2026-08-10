import type {
  HistoricalSignalCode,
  InvestigationLeadCode,
} from "@/services/correlation/investigationIntelligenceTypes";

export const historicalSignalLabels: Record<HistoricalSignalCode, string> = {
  RECURRING_USERNAME: "相同账号",
  RECURRING_SOURCE_IP: "相同源 IP",
  RECURRING_SYSTEM: "共同业务系统",
  REPEATED_EXTERNAL_ALERT_ID: "重复原始告警 ID",
};

export const investigationLeadLabels: Record<InvestigationLeadCode, string> = {
  VERIFY_RECURRING_ACCOUNT:
    "建议核查该账号在关联案件中的使用人、职责和业务背景是否一致",
  VERIFY_SOURCE_IP_OWNERSHIP:
    "建议核查源 IP 归属，确认是否为共享出口 / VPN / NAT / 固定终端",
  COMPARE_SHARED_SYSTEM_ACTIVITY:
    "建议对比关联案件在共同业务系统中的访问时间、操作范围与上下文",
  CHECK_DUPLICATE_ALERT_PROVENANCE:
    "建议核查是否为同一原始告警重复建案或重复导入",
  REVIEW_RELATED_CASE_TIMELINES:
    "建议对比关联历史案件的时间线与关键活动顺序",
};

export function formatHistoricalSignal(code: HistoricalSignalCode): string {
  return historicalSignalLabels[code];
}

export function formatInvestigationLead(code: InvestigationLeadCode): string {
  return investigationLeadLabels[code];
}
