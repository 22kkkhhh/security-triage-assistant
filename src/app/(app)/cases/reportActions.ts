"use server";

import type { ReportData } from "@/domain/types";
import {
  getCaseById,
  saveReportDraft,
} from "@/services/persistence/caseRepository";
import {
  getOrCreateReportDraft,
  getReportExportPayload,
} from "@/services/persistence/reportDraftService";

export type SaveReportActionResult =
  | { ok: true; updatedAt: string; reportUpdatedAt: string }
  | { ok: false; error: string };

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

/** 保存完整 reportDraft；不修改 caseState / HumanReview / Checklist */
export async function saveReportDraftAction(
  caseId: string,
  rawReport: unknown,
): Promise<SaveReportActionResult> {
  if (!caseId || typeof caseId !== "string" || !caseId.trim()) {
    return { ok: false, error: "案件 ID 无效" };
  }
  const parsed = parseReportData(rawReport);
  if (typeof parsed === "string") {
    return { ok: false, error: parsed };
  }

  try {
    const existing = await getCaseById(caseId);
    if (!existing) return { ok: false, error: "案件不存在" };
    const saved = await saveReportDraft(caseId, parsed);
    return {
      ok: true,
      updatedAt: saved.reportUpdatedAt ?? saved.updatedAt,
      reportUpdatedAt: saved.reportUpdatedAt ?? saved.updatedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "报告保存失败";
    return { ok: false, error: message };
  }
}

/** 服务端确保草稿存在（页面也可直接调用 getOrCreateReportDraft） */
export async function ensureReportDraftAction(caseId: string) {
  if (!caseId?.trim()) {
    return { ok: false as const, error: "案件 ID 无效" };
  }
  try {
    const bundle = await getOrCreateReportDraft(caseId);
    if (!bundle) return { ok: false as const, error: "案件不存在" };
    return { ok: true as const, freshlyCreated: bundle.freshlyCreated };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "报告初稿生成失败，请重试。";
    return { ok: false as const, error: message };
  }
}

/** 报告中心/导出：仅返回已保存 reportDraft，绝不临时 build */
export async function getReportExportPayloadAction(caseId: string) {
  if (!caseId?.trim()) {
    return { ok: false as const, error: "案件 ID 无效" };
  }
  try {
    const payload = await getReportExportPayload(caseId);
    if (!payload) {
      return { ok: false as const, error: "报告草稿不存在" };
    }
    return { ok: true as const, ...payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取报告失败";
    return { ok: false as const, error: message };
  }
}
