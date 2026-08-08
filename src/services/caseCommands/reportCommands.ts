/**
 * 报告 Semantic Commands：创建 / 保存（可选审计） / 导出。
 * reportDraft 为唯一草稿 SoT；Audit 不存正文。
 */

import type { ReportData } from "@/domain/types";
import { prisma } from "@/lib/prisma";
import {
  buildReportCreatedAudit,
  buildReportExportedAudit,
  buildReportUpdatedAudit,
} from "@/services/audit/auditEventBuilder";
import {
  appendCaseAudit,
  findAuditByOperationId,
  runInTransaction,
} from "@/services/persistence/auditRepository";
import {
  getCaseById,
  saveReportDraft,
  StaleReportDraftError,
} from "@/services/persistence/caseRepository";
import type { PersistedCase } from "@/services/persistence/types";
import {
  buildInitialReportFromRecord,
  getReportExportPayload,
} from "@/services/persistence/reportDraftService";
import {
  generateDocxBuffer,
  suggestDocxFileName,
} from "@/services/reporting/docxGenerator";
import type { CommandResult } from "./types";

function reviewerOf(record: PersistedCase): string | null {
  return record.caseState.humanReview?.reviewer ?? null;
}

async function resolveReportOperation(
  caseId: string,
  operationId: string,
): Promise<CommandResult | null> {
  const existing = await findAuditByOperationId(operationId);
  if (!existing) return null;
  if (existing.caseId !== caseId) {
    return { ok: false, error: "operationId 已被其他案件使用" };
  }
  const record = await getCaseById(caseId);
  if (!record) return { ok: false, error: "案件不存在" };
  return {
    ok: true,
    alreadyApplied: true,
    case: record,
    audit: existing,
  };
}

/** 显式生成报告初稿（禁止 GET 副作用创建） */
export async function createReportDraftCommand(input: {
  caseId: string;
  operationId: string;
}): Promise<CommandResult> {
  const idempotent = await resolveReportOperation(
    input.caseId,
    input.operationId,
  );
  if (idempotent) return idempotent;

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };

  if (existing.reportDraft) {
    // 已有草稿：不覆盖、不重复 REPORT_CREATED
    return {
      ok: true,
      alreadyApplied: true,
      case: existing,
      audit: null,
    };
  }

  const report = buildInitialReportFromRecord(existing);

  try {
    const audit = await runInTransaction(async (tx) => {
      const again = await tx.caseRecord.findUnique({
        where: { id: input.caseId },
      });
      if (!again) throw new Error("案件不存在");
      if (again.reportDraft != null) {
        throw new Error("REPORT_ALREADY_EXISTS");
      }
      await saveReportDraft(input.caseId, report, tx);
      return appendCaseAudit(
        {
          caseId: input.caseId,
          ...buildReportCreatedAudit({
            caseNumber: existing.caseNumber,
            reviewer: reviewerOf(existing),
            operationId: input.operationId,
          }),
        },
        tx,
      );
    });

    const saved = await getCaseById(input.caseId);
    if (!saved) return { ok: false, error: "案件不存在" };
    return {
      ok: true,
      alreadyApplied: false,
      case: saved,
      audit,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "报告初稿生成失败";
    if (message === "REPORT_ALREADY_EXISTS") {
      const current = await getCaseById(input.caseId);
      if (current) {
        return {
          ok: true,
          alreadyApplied: true,
          case: current,
          audit: null,
        };
      }
    }
    const raced = await resolveReportOperation(input.caseId, input.operationId);
    if (raced) return raced;
    return { ok: false, error: message === "REPORT_ALREADY_EXISTS" ? "报告已存在" : message };
  }
}

/**
 * 保存报告草稿。
 * auditOperationId 有值：本编辑会话首次有意义保存 → REPORT_UPDATED + lastActivityAt
 * auditOperationId 为空：普通 autosave → 仅更新 reportDraft / reportUpdatedAt
 */
export async function saveReportDraftCommand(input: {
  caseId: string;
  reportDraft: ReportData;
  baseReportUpdatedAt: string | null;
  auditOperationId?: string | null;
}): Promise<CommandResult> {
  if (input.auditOperationId?.trim()) {
    const idempotent = await resolveReportOperation(
      input.caseId,
      input.auditOperationId.trim(),
    );
    if (idempotent) return idempotent;
  }

  const existing = await getCaseById(input.caseId);
  if (!existing) return { ok: false, error: "案件不存在" };
  if (!existing.reportDraft && !input.auditOperationId) {
    return { ok: false, error: "报告草稿不存在" };
  }

  try {
    if (input.auditOperationId?.trim()) {
      const opId = input.auditOperationId.trim();
      const fromAt = existing.reportUpdatedAt;
      const audit = await runInTransaction(async (tx) => {
        await saveReportDraft(input.caseId, input.reportDraft, tx, {
          baseReportUpdatedAt: input.baseReportUpdatedAt,
        });
        const after = await tx.caseRecord.findUnique({
          where: { id: input.caseId },
        });
        return appendCaseAudit(
          {
            caseId: input.caseId,
            ...buildReportUpdatedAudit({
              caseNumber: existing.caseNumber,
              reportUpdatedAtFrom: fromAt,
              reportUpdatedAtTo: after?.reportUpdatedAt?.toISOString() ?? null,
              reviewer: reviewerOf(existing),
              operationId: opId,
            }),
          },
          tx,
        );
      });
      const saved = await getCaseById(input.caseId);
      if (!saved) return { ok: false, error: "案件不存在" };
      return {
        ok: true,
        alreadyApplied: false,
        case: saved,
        audit,
      };
    }

    const saved = await saveReportDraft(
      input.caseId,
      input.reportDraft,
      prisma,
      { baseReportUpdatedAt: input.baseReportUpdatedAt },
    );
    return {
      ok: true,
      alreadyApplied: false,
      case: saved,
      audit: null,
    };
  } catch (error) {
    if (error instanceof StaleReportDraftError) {
      return { ok: false, error: error.message };
    }
    const message = error instanceof Error ? error.message : "报告保存失败";
    return { ok: false, error: message };
  }
}

export type ExportReportCommandResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      fileBase64: string;
      fileName: string;
      case: PersistedCase;
      lastActivityAt: string;
      reportUpdatedAt: string | null;
    }
  | { ok: false; error: string };

/** 服务器成功生成 DOCX 后才记 REPORT_EXPORTED */
export async function exportReportCommand(input: {
  caseId: string;
  operationId: string;
  maskSensitive?: boolean;
}): Promise<ExportReportCommandResult> {
  const existingAudit = await findAuditByOperationId(input.operationId);
  if (existingAudit) {
    if (existingAudit.caseId !== input.caseId) {
      return { ok: false, error: "operationId 已被其他案件使用" };
    }
    const record = await getCaseById(input.caseId);
    if (!record?.reportDraft) {
      return { ok: false, error: "报告草稿不存在" };
    }
    const payload = await getReportExportPayload(input.caseId);
    if (!payload) return { ok: false, error: "报告草稿不存在" };
    try {
      const buffer = await generateDocxBuffer(
        payload.report,
        {
          evidences: payload.evidences,
          timeline: payload.timeline,
        },
        { maskSensitive: input.maskSensitive !== false },
      );
      return {
        ok: true,
        alreadyApplied: true,
        fileBase64: Buffer.from(buffer).toString("base64"),
        fileName: suggestDocxFileName(payload.report),
        case: record,
        lastActivityAt: record.lastActivityAt,
        reportUpdatedAt: record.reportUpdatedAt,
      };
    } catch {
      return { ok: false, error: "Word 报告导出失败，请重试。" };
    }
  }

  const payload = await getReportExportPayload(input.caseId);
  if (!payload) return { ok: false, error: "报告草稿不存在" };

  let buffer: Buffer;
  try {
    buffer = await generateDocxBuffer(
      payload.report,
      {
        evidences: payload.evidences,
        timeline: payload.timeline,
      },
      { maskSensitive: input.maskSensitive !== false },
    );
  } catch {
    return { ok: false, error: "Word 报告导出失败，请重试。" };
  }

  const fileName = suggestDocxFileName(payload.report);
  const record = await getCaseById(input.caseId);
  if (!record) return { ok: false, error: "案件不存在" };

  try {
    await runInTransaction(async (tx) => {
      await appendCaseAudit(
        {
          caseId: input.caseId,
          ...buildReportExportedAudit({
            caseNumber: payload.caseNumber,
            fileName,
            reviewer: reviewerOf(record),
            operationId: input.operationId,
          }),
        },
        tx,
      );
    });
  } catch (error) {
    const raced = await findAuditByOperationId(input.operationId);
    if (!raced) {
      const message =
        error instanceof Error ? error.message : "导出审计写入失败";
      return { ok: false, error: message };
    }
  }

  const refreshed = await getCaseById(input.caseId);
  if (!refreshed) return { ok: false, error: "案件不存在" };

  return {
    ok: true,
    alreadyApplied: false,
    fileBase64: Buffer.from(buffer).toString("base64"),
    fileName,
    case: refreshed,
    lastActivityAt: refreshed.lastActivityAt,
    reportUpdatedAt: refreshed.reportUpdatedAt,
  };
}
