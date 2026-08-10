import {
  StaleCaseStateError,
  StaleReportDraftError,
} from "@/services/persistence/caseRepository";

/** 跨 app boundary 返回的稳定产品文案（未知 infrastructure 异常） */
export const COMMAND_ERROR_MESSAGES = {
  caseUpdate: "案件更新暂未完成，请稍后重试。",
  caseCreate: "案件创建暂未完成，请稍后重试。",
  reportCreate: "报告初稿生成暂未完成，请稍后重试。",
  reportSave: "报告保存暂未完成，请稍后重试。",
  reportExportAudit: "报告导出暂未完成，请稍后重试。",
  handoffAdd: "交接记录暂未完成，请稍后重试。",
  actorInvalid: "操作者信息无效，请刷新后重试。",
  handoffValidation: "交接说明无效，请检查后重试。",
} as const;

const PASS_THROUGH_PREFIXES = [
  "USER Actor",
  "认证命令不得",
  "交接说明",
] as const;

const PASS_THROUGH_EXACT = new Set([
  "案件不存在",
  "报告已存在",
  "报告草稿不存在",
  "baseUpdatedAt 无效",
  "operationId 无效",
]);

export function isKnownBusinessCommandError(error: unknown): boolean {
  if (error instanceof StaleCaseStateError) return true;
  if (error instanceof StaleReportDraftError) return true;
  if (!(error instanceof Error)) return false;

  if (PASS_THROUGH_EXACT.has(error.message)) return true;
  if (error.message === "REPORT_ALREADY_EXISTS") return true;

  return PASS_THROUGH_PREFIXES.some((prefix) =>
    error.message.startsWith(prefix),
  );
}

/**
 * 将 catch 到的异常映射为可跨 boundary 返回的 CommandResult.error。
 * 已知业务/校验错误保留原文；未知 infrastructure 异常使用稳定文案。
 */
export function resolveCommandErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isKnownBusinessCommandError(error) && error instanceof Error) {
    if (error.message === "REPORT_ALREADY_EXISTS") {
      return "报告已存在";
    }
    return error.message;
  }
  return fallback;
}

/** Compliance runtime resolver 失败时的稳定诊断（不含内部 exception.message） */
export const COMPLIANCE_RUNTIME_UNAVAILABLE_MESSAGE =
  "合规运行时暂不可用，请稍后重试。";
