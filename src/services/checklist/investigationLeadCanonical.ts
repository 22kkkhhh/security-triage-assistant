/**
 * Investigation Lead → Checklist 的确定性映射（Server-owned）。
 */

import type { SecurityDomain } from "@/domain/types";
import type { InvestigationLeadCode } from "@/services/correlation/investigationIntelligenceTypes";

export const INVESTIGATION_LEAD_CODES: readonly InvestigationLeadCode[] = [
  "VERIFY_RECURRING_ACCOUNT",
  "VERIFY_SOURCE_IP_OWNERSHIP",
  "COMPARE_SHARED_SYSTEM_ACTIVITY",
  "CHECK_DUPLICATE_ALERT_PROVENANCE",
  "REVIEW_RELATED_CASE_TIMELINES",
] as const;

export function isInvestigationLeadCode(
  value: string,
): value is InvestigationLeadCode {
  return (INVESTIGATION_LEAD_CODES as readonly string[]).includes(value);
}

export function investigationLeadKey(code: InvestigationLeadCode): string {
  return `INVESTIGATION_LEAD:${code}`;
}

/** Checklist 文案：去掉「建议」前缀，由 Server canonicalize */
export const investigationLeadChecklistLabels: Record<
  InvestigationLeadCode,
  string
> = {
  VERIFY_RECURRING_ACCOUNT:
    "核查关联案件中账号使用人、职责和业务背景是否一致",
  VERIFY_SOURCE_IP_OWNERSHIP:
    "核查源 IP 归属及是否为共享出口 / VPN / NAT / 固定终端",
  COMPARE_SHARED_SYSTEM_ACTIVITY:
    "对比关联案件在共同业务系统中的访问时间、操作范围与上下文",
  CHECK_DUPLICATE_ALERT_PROVENANCE:
    "核查是否存在同一原始告警重复建案或重复导入",
  REVIEW_RELATED_CASE_TIMELINES:
    "对比关联历史案件的时间线与关键活动顺序",
};

export const investigationLeadChecklistCategories: Record<
  InvestigationLeadCode,
  SecurityDomain
> = {
  VERIFY_RECURRING_ACCOUNT: "IDENTITY",
  VERIFY_SOURCE_IP_OWNERSHIP: "NETWORK",
  COMPARE_SHARED_SYSTEM_ACTIVITY: "IDENTITY",
  CHECK_DUPLICATE_ALERT_PROVENANCE: "BUSINESS",
  REVIEW_RELATED_CASE_TIMELINES: "BUSINESS",
};

/** Lead → 对应 Historical Signal（用于 provenance 快照） */
export const investigationLeadPrimarySignal: Partial<
  Record<InvestigationLeadCode, string>
> = {
  VERIFY_RECURRING_ACCOUNT: "RECURRING_USERNAME",
  VERIFY_SOURCE_IP_OWNERSHIP: "RECURRING_SOURCE_IP",
  COMPARE_SHARED_SYSTEM_ACTIVITY: "RECURRING_SYSTEM",
  CHECK_DUPLICATE_ALERT_PROVENANCE: "REPEATED_EXTERNAL_ALERT_ID",
};
