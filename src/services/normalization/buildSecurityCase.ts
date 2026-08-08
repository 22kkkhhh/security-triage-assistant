import type { ObservationStatus, SecurityCaseDraft } from "@/domain/types";
import { importSourceTypeLabels, type NormalizedSecurityInput } from "./types";

/**
 * 非工作时间口径（演示简化）：00:00 - 07:00 视为非工作时间。
 * 无法解析时间时返回 UNKNOWN，不得假设为正常。
 */
function deriveOutsideBusinessHours(alertTime: string | null): ObservationStatus {
  if (!alertTime) return "UNKNOWN";
  const match = /(\d{1,2}):(\d{2})/.exec(alertTime);
  if (!match) return "UNKNOWN";
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "UNKNOWN";
  return hour < 7 ? "ABNORMAL" : "NORMAL";
}

/**
 * 仅在人工确认之后调用：
 * 将确认后的标准化输入构造为 SecurityCaseDraft，进入现有规则引擎。
 * - 缺失字段保持 null / UNKNOWN，不伪造默认值；
 * - 业务上下文统一初始化为“未获取信息”；
 * - humanReview 为 null（尚未人工研判）。
 */
export function buildSecurityCaseDraft(
  input: NormalizedSecurityInput,
  caseId: string,
): SecurityCaseDraft {
  const baselineComplete =
    input.baselineAverage !== null ||
    input.baselineMax !== null ||
    input.baselineObservationDays !== null;

  const externalDestination =
    input.destinationIp !== null
      ? `${input.destinationIp}${
          input.destinationPort !== null ? `:${input.destinationPort}` : ""
        }${input.protocol ? `（${input.protocol}）` : ""}`
      : null;

  return {
    id: caseId,
    name: input.alertName ?? "未命名研判案件",
    createdAt: new Date().toISOString(),
    alert: {
      title: input.alertName ?? "未命名告警",
      source:
        input.alertSource ?? `${importSourceTypeLabels[input.sourceType]}（导入）`,
      severity: null,
      occurredAt: input.alertTime,
      description: input.description ?? "",
      originalAlertId: null,
    },
    dataContext: {
      accessStatus: "UNKNOWN",
      databaseName: input.database,
      tableName: input.tableName,
      accessedRecordCount: input.rowsAffected,
      sensitiveFieldTypes: input.sensitiveDataTypes,
      operationType: input.operation,
      outsideBusinessHours: deriveOutsideBusinessHours(input.alertTime),
      baseline: baselineComplete
        ? {
            averageRecordCount: input.baselineAverage,
            maxRecordCount: input.baselineMax,
            observationDays: input.baselineObservationDays,
          }
        : null,
      note: input.sql ? `原始 SQL（脱敏后人工摘录）：${input.sql}` : null,
    },
    networkContext: {
      networkStatus: "UNKNOWN",
      internalSourceIp: input.sourceIp,
      externalCommunication: input.externalCommunication ?? "UNKNOWN",
      externalDestination,
      outboundTransferBytes: input.outboundTransferBytes,
      note: null,
    },
    identityContext: {
      identityStatus: "UNKNOWN",
      accountName: input.username,
      failedLoginAttempts: input.failedLoginAttempts,
      loginFromUnseenSource: "UNKNOWN",
      loginSourceIp: input.sourceIp,
      accessedSystems: input.accessedSystems,
      note: null,
    },
    businessContext: {
      plannedTaskStatus: "UNKNOWN",
      changeTicketStatus: "UNKNOWN",
      changeTicketId: null,
      businessOwner: null,
      ownerVerification: "UNKNOWN",
      businessLegitimacy: "UNKNOWN",
      businessJustification: null,
    },
    timeline: [],
    humanReview: null,
    report: null,
  };
}
