"use server";

import type {
  BusinessContext,
  CaseStatus,
  ChecklistItem,
  HumanReview,
  RiskLevel,
  TimelineEvent,
} from "@/domain/types";
import {
  getCaseById,
  saveCaseState,
} from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

export type SaveCaseActionResult =
  | { ok: true; updatedAt: string; status: CaseStatus }
  | { ok: false; error: string };

const CASE_STATUSES: CaseStatus[] = [
  "NEW",
  "INVESTIGATING",
  "PENDING_VERIFICATION",
  "PENDING_BUSINESS_CONFIRMATION",
  "RESPONDING",
  "CLOSED",
];

const RISK_LEVELS: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === "string" && CASE_STATUSES.includes(value as CaseStatus);
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === null || (typeof value === "string" && RISK_LEVELS.includes(value as RiskLevel));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 轻量运行时校验：不引入 Zod，只拦截明显非法载荷。
 */
function parseSaveInput(raw: unknown): SaveCaseStateInput | string {
  if (!isObject(raw)) return "保存数据格式无效";
  if (!isObject(raw.caseData)) return "caseData 无效";
  if (!isObject(raw.businessContext)) return "businessContext 无效";
  if (!Array.isArray(raw.checklist)) return "checklist 无效";
  if (!Array.isArray(raw.timeline)) return "timeline 无效";
  if (raw.humanReview !== null && !isObject(raw.humanReview)) {
    return "humanReview 无效";
  }
  if (raw.status !== undefined && !isCaseStatus(raw.status)) {
    return "案件状态无效";
  }
  if (!isRiskLevel(raw.suggestedRiskLevel ?? null)) {
    return "建议风险等级无效";
  }

  return {
    caseData: raw.caseData as unknown as SaveCaseStateInput["caseData"],
    businessContext: raw.businessContext as unknown as BusinessContext,
    checklist: raw.checklist as unknown as ChecklistItem[],
    humanReview: raw.humanReview as unknown as HumanReview | null,
    timeline: raw.timeline as unknown as TimelineEvent[],
    suggestedRiskLevel: (raw.suggestedRiskLevel ?? null) as RiskLevel | null,
    status: raw.status as CaseStatus | undefined,
  };
}

/** 保存案件可恢复状态（完整 caseState + 可选 status） */
export async function saveCaseStateAction(
  caseId: string,
  rawInput: unknown,
): Promise<SaveCaseActionResult> {
  if (!caseId || typeof caseId !== "string" || !caseId.trim()) {
    return { ok: false, error: "案件 ID 无效" };
  }

  const parsed = parseSaveInput(rawInput);
  if (typeof parsed === "string") {
    return { ok: false, error: parsed };
  }

  try {
    const existing = await getCaseById(caseId);
    if (!existing) {
      return { ok: false, error: "案件不存在" };
    }
    const saved = await saveCaseState(caseId, parsed);
    return {
      ok: true,
      updatedAt: saved.updatedAt,
      status: saved.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return { ok: false, error: message };
  }
}

/** 仅更新案件状态（仍走完整 save 边界时由客户端带全量 caseState 更稳妥；此为便捷入口） */
export async function updateCaseStatusAction(
  caseId: string,
  status: unknown,
  rawInput: unknown,
): Promise<SaveCaseActionResult> {
  if (!isCaseStatus(status)) {
    return { ok: false, error: "案件状态无效" };
  }
  if (!isObject(rawInput)) {
    return { ok: false, error: "保存数据格式无效" };
  }
  return saveCaseStateAction(caseId, { ...rawInput, status });
}
