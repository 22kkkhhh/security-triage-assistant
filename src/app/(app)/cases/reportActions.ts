"use server";

import type { ReportData } from "@/domain/types";
import {
  createReportDraftCommand,
  exportReportCommand,
  saveReportDraftCommand,
} from "@/services/caseCommands";
import {
  requirePermission,
  toAuthActionFailure,
} from "@/services/auth/requirePermission";
import {
  getCaseById,
  StaleReportDraftError,
} from "@/services/persistence/caseRepository";

export type SaveReportActionResult =
  | {
      ok: true;
      alreadyApplied?: boolean;
      updatedAt: string;
      reportUpdatedAt: string;
      lastActivityAt: string;
      audited: boolean;
    }
  | {
      ok: false;
      error: string;
      code?: "STALE_REPORT" | "UNAUTHENTICATED" | "FORBIDDEN";
      reportUpdatedAt?: string | null;
    };

export type CreateReportActionResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      caseId: string;
      updatedAt: string;
      reportUpdatedAt: string | null;
      lastActivityAt: string;
    }
  | {
      ok: false;
      error: string;
      code?: "UNAUTHENTICATED" | "FORBIDDEN";
    };

export type ExportReportActionResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      fileBase64: string;
      fileName: string;
      lastActivityAt: string;
      reportUpdatedAt: string | null;
    }
  | {
      ok: false;
      error: string;
      code?: "UNAUTHENTICATED" | "FORBIDDEN";
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReportData(raw: unknown): ReportData | string {
  if (!isObject(raw)) return "报告数据格式无效";
  if (typeof raw.title !== "string" || typeof raw.caseNumber !== "string") {
    return "报告标题或案件编号无效";
  }
  if (!Array.isArray(raw.sections) || !Array.isArray(raw.basicInfo)) {
    return "报告章节格式无效";
  }
  if (!Array.isArray(raw.evidenceIds) || !Array.isArray(raw.timelineEventIds)) {
    return "报告引用列表无效";
  }
  return raw as unknown as ReportData;
}

/** 显式生成报告初稿 */
export async function createReportDraftAction(
  caseId: string,
  operationId: unknown,
): Promise<CreateReportActionResult> {
  try {
    await requirePermission("REPORT_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const result = await createReportDraftCommand({
    caseId,
    operationId: operationId.trim(),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    caseId: result.case.id,
    updatedAt: result.case.updatedAt,
    reportUpdatedAt: result.case.reportUpdatedAt,
    lastActivityAt: result.case.lastActivityAt,
  };
}

/** 保存完整 reportDraft；可选本会话首次审计 */
export async function saveReportDraftAction(
  caseId: string,
  rawReport: unknown,
  options?: {
    baseReportUpdatedAt?: string | null;
    auditOperationId?: string | null;
  },
): Promise<SaveReportActionResult> {
  try {
    await requirePermission("REPORT_WRITE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId || typeof caseId !== "string" || !caseId.trim()) {
    return { ok: false, error: "案件 ID 无效" };
  }
  const parsed = parseReportData(rawReport);
  if (typeof parsed === "string") {
    return { ok: false, error: parsed };
  }

  try {
    const result = await saveReportDraftCommand({
      caseId,
      reportDraft: parsed,
      baseReportUpdatedAt: options?.baseReportUpdatedAt ?? null,
      auditOperationId: options?.auditOperationId ?? null,
    });
    if (!result.ok) {
      if (result.error.includes("其他页面") || result.error.includes("已发生更新")) {
        const latest = await getCaseById(caseId);
        return {
          ok: false,
          error:
            "报告已在其他页面发生更新。为避免覆盖，请刷新后重新确认内容。",
          code: "STALE_REPORT",
          reportUpdatedAt: latest?.reportUpdatedAt ?? null,
        };
      }
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      alreadyApplied: result.alreadyApplied,
      updatedAt: result.case.reportUpdatedAt ?? result.case.updatedAt,
      reportUpdatedAt: result.case.reportUpdatedAt ?? result.case.updatedAt,
      lastActivityAt: result.case.lastActivityAt,
      audited: Boolean(result.audit),
    };
  } catch (error) {
    if (error instanceof StaleReportDraftError) {
      const latest = await getCaseById(caseId);
      return {
        ok: false,
        error:
          "报告已在其他页面发生更新。为避免覆盖，请刷新后重新确认内容。",
        code: "STALE_REPORT",
        reportUpdatedAt: latest?.reportUpdatedAt ?? null,
      };
    }
    const message = error instanceof Error ? error.message : "报告保存失败";
    return { ok: false, error: message };
  }
}

/** 统一导出：报告页与报告中心共用 */
export async function exportReportAction(
  caseId: string,
  operationId: unknown,
  maskSensitive: unknown = true,
): Promise<ExportReportActionResult> {
  try {
    await requirePermission("REPORT_EXPORT");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  if (!caseId?.trim()) return { ok: false, error: "案件 ID 无效" };
  if (typeof operationId !== "string" || !operationId.trim()) {
    return { ok: false, error: "operationId 无效" };
  }
  const result = await exportReportCommand({
    caseId,
    operationId: operationId.trim(),
    maskSensitive: maskSensitive !== false,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    fileBase64: result.fileBase64,
    fileName: result.fileName,
    lastActivityAt: result.lastActivityAt,
    reportUpdatedAt: result.reportUpdatedAt,
  };
}
