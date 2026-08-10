import type { ReportData } from "@/domain/types";

/**
 * 保存可编辑 ReportData 时保留服务端已冻结的 complianceReferences。
 * 客户端不得通过 payload 修改、删除或替换 Snapshot。
 */
export function preserveFrozenComplianceReferences(
  serverDraft: ReportData | null | undefined,
  clientDraft: ReportData,
): ReportData {
  if (serverDraft == null) {
    return clientDraft;
  }
  return {
    ...clientDraft,
    complianceReferences: serverDraft.complianceReferences,
  };
}
