import type { RelatedCaseReasonCode } from "@/services/correlation/types";

export const relatedCaseReasonLabels: Record<RelatedCaseReasonCode, string> = {
  SAME_USERNAME: "相同账号",
  SAME_SOURCE_IP: "相同源 IP",
  SHARED_SYSTEM: "重叠业务系统",
  SAME_EXTERNAL_ALERT_ID: "原始告警 ID 相同",
  SAME_ALERT_SOURCE: "相同告警来源",
};

export function formatRelatedCaseReason(code: RelatedCaseReasonCode): string {
  return relatedCaseReasonLabels[code];
}
