"use server";

import type { CaseStatus } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import type { NormalizedSecurityInput } from "@/services/normalization/types";
import { createCaseWithAudit } from "@/services/caseCommands";
import {
  getCaseById,
  saveCaseSnapshot,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";

export type SaveCaseActionResult =
  | { ok: true; updatedAt: string; status: CaseStatus; stale?: boolean }
  | {
      ok: false;
      error: string;
      code?: "STALE";
      /** STALE 时返回服务端真实版本，供客户端同步 baseUpdatedAt */
      updatedAt?: string;
      lastActivityAt?: string;
      status?: CaseStatus;
      caseState?: import("@/services/persistence/types").PersistedCaseState;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Snapshot Autosave：仅接受 CaseSnapshotPatch（allowlisted 非语义字段）。
 * 禁止通过完整 PersistedCaseState 绕过 Semantic Command / Audit。
 */
export async function saveCaseStateAction(
  caseId: string,
  rawInput: unknown,
): Promise<SaveCaseActionResult> {
  if (!caseId || typeof caseId !== "string" || !caseId.trim()) {
    return { ok: false, error: "案件 ID 无效" };
  }

  try {
    const existing = await getCaseById(caseId);
    if (!existing) {
      return { ok: false, error: "案件不存在" };
    }
    const saved = await saveCaseSnapshot(caseId, rawInput);
    return {
      ok: true,
      updatedAt: saved.updatedAt,
      status: saved.status,
    };
  } catch (error) {
    if (error instanceof StaleCaseStateError) {
      const latest = await getCaseById(caseId);
      if (!latest) {
        return { ok: false, error: "案件不存在", code: "STALE" };
      }
      return {
        ok: false,
        error: "案件已发生更新，已刷新到最新状态。",
        code: "STALE",
        updatedAt: latest.updatedAt,
        lastActivityAt: latest.lastActivityAt,
        status: latest.status,
        caseState: latest.caseState,
      };
    }
    const message = error instanceof Error ? error.message : "保存失败";
    return { ok: false, error: message };
  }
}

export type CreateCaseActionResult =
  | { ok: true; id: string; caseNumber: string; alreadyApplied?: boolean }
  | { ok: false; error: string };

const SOURCE_TYPES = [
  "DATABASE_AUDIT",
  "FIREWALL",
  "AUTH",
  "VPN",
  "BASTION_HOST",
  "DLP",
  "API_SECURITY",
  "MANUAL",
  "OTHER",
] as const;

function parseNormalizedInput(
  raw: unknown,
): NormalizedSecurityInput | string {
  if (!isObject(raw)) return "导入数据格式无效";
  if (
    typeof raw.sourceType !== "string" ||
    !SOURCE_TYPES.includes(raw.sourceType as (typeof SOURCE_TYPES)[number])
  ) {
    return "数据来源类型无效";
  }
  if (!Array.isArray(raw.accessedSystems) || !Array.isArray(raw.sensitiveDataTypes)) {
    return "标准化字段格式无效";
  }
  return raw as unknown as NormalizedSecurityInput;
}

/**
 * 人工确认后创建 CaseRecord：
 * 标准化输入 → SecurityCaseDraft → 规则分析 → createCaseWithAudit → 返回 id。
 * operationId：创建幂等；response 丢失后 retry 返回同一 caseId，不建第二条。
 */
export async function createCaseAction(
  rawInput: unknown,
  operationId?: unknown,
): Promise<CreateCaseActionResult> {
  const parsed = parseNormalizedInput(rawInput);
  if (typeof parsed === "string") {
    return { ok: false, error: parsed };
  }
  if (
    operationId !== undefined &&
    (typeof operationId !== "string" || !operationId.trim())
  ) {
    return { ok: false, error: "operationId 无效" };
  }

  try {
    const caseName =
      parsed.alertName?.trim() || "安全告警研判案件";
    const draft = buildSecurityCaseDraft(parsed, "pending-create");
    const namedDraft = {
      ...draft,
      name: caseName,
      alert: {
        ...draft.alert,
        title: parsed.alertName?.trim() || caseName,
      },
    };
    const analyzed = analyzeSecurityCase(namedDraft);

    const created = await createCaseWithAudit(
      {
        draft: {
          name: namedDraft.name,
          createdAt: namedDraft.createdAt,
          alert: namedDraft.alert,
          dataContext: namedDraft.dataContext,
          networkContext: namedDraft.networkContext,
          identityContext: namedDraft.identityContext,
          businessContext: namedDraft.businessContext,
          humanReview: null,
          timeline: namedDraft.timeline,
        },
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
        status: "INVESTIGATING",
      },
      {
        sourceType: parsed.sourceType,
        operationId:
          typeof operationId === "string" ? operationId.trim() : null,
      },
    );

    if (!created.ok) {
      return { ok: false, error: created.error };
    }

    return {
      ok: true,
      id: created.case.id,
      caseNumber: created.case.caseNumber,
      alreadyApplied: created.alreadyApplied,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "案件创建失败";
    return { ok: false, error: message };
  }
}
