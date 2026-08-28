"use server";

import { createHash, randomUUID } from "node:crypto";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { userActor } from "@/services/audit/auditEventBuilder";
import { createCaseWithAudit } from "@/services/caseCommands";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import type { ImportSourceType, NormalizedSecurityInput } from "@/services/normalization/types";
import { normalizeJsonAlert } from "@/services/intake/parseJsonAlert";
import { normalizeWazuhAlert } from "@/services/intake/wazuhAlertAdapter";
import { parseJsonlLines } from "@/services/intake/parseJsonl";
import { redactRawAlert } from "@/services/intake/redactRawAlert";
import { createRawAlertRecord, updateRawAlertIngestResult } from "@/services/persistence/rawAlertRepository";
import { requirePermission, toAuthActionFailure } from "@/services/auth/requirePermission";
import { sanitizeActionErrorMessage, unknownActionErrorMessage } from "@/app/(app)/actionErrorSanitizer";

const SOURCE_TYPES: readonly ImportSourceType[] = [
  "DATABASE_AUDIT", "FIREWALL", "AUTH", "VPN", "BASTION_HOST", "DLP",
  "API_SECURITY", "WAZUH", "MANUAL", "OTHER",
];
const MAX_RAW_JSON_CHARS = 256_000;
const BATCH_FALLBACK = "批量导入暂未完成，请稍后重试。";

export type BatchImportItem = {
  line: number;
  status: "CREATED" | "DUPLICATE" | "REJECTED";
  caseId?: string;
  caseNumber?: string;
  error?: string;
};

export type BatchImportResult =
  | { ok: true; total: number; created: number; duplicate: number; rejected: number; items: BatchImportItem[] }
  | { ok: false; error: string; code?: "UNAUTHENTICATED" | "FORBIDDEN" };

function isSourceType(value: unknown): value is ImportSourceType {
  return typeof value === "string" && SOURCE_TYPES.includes(value as ImportSourceType);
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function createFromNormalized(input: NormalizedSecurityInput, actor: Parameters<typeof userActor>[0], operationId: string) {
  const caseName = input.alertName?.trim() || "安全告警研判案件";
  const draft = buildSecurityCaseDraft(input, "batch-import");
  const namedDraft = {
    ...draft,
    name: caseName,
    alert: { ...draft.alert, title: input.alertName?.trim() || caseName },
  };
  const analyzed = analyzeSecurityCase(namedDraft);
  return createCaseWithAudit(
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
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      status: "INVESTIGATING",
    },
    { actor: userActor(actor), sourceType: input.sourceType, operationId },
  );
}

/**
 * 批量 JSONL 导入：每行先脱敏留存 RawAlertRecord，再进入现有案件创建命令。
 * 原始密钥不会进入数据库、日志或返回值；重复告警保留接收记录但不重复建案。
 */
export async function importJsonlAction(rawText: unknown, rawSourceType: unknown, rawBatchId?: unknown): Promise<BatchImportResult> {
  let actor;
  try {
    actor = await requirePermission("CASE_CREATE");
  } catch (error) {
    return toAuthActionFailure(error);
  }

  if (typeof rawText !== "string") return { ok: false, error: "JSONL 内容无效" };
  if (!isSourceType(rawSourceType)) return { ok: false, error: "数据来源类型无效" };
  const batchId = typeof rawBatchId === "string" && rawBatchId.trim() ? rawBatchId.trim() : randomUUID();

  try {
    const parsed = parseJsonlLines(rawText);
    const items: BatchImportItem[] = parsed.failures.map((failure) => ({
      line: failure.line,
      status: "REJECTED",
      error: failure.error,
    }));

    for (const entry of parsed.entries) {
      const rawJson = JSON.stringify(entry.value);
      if (rawJson.length > MAX_RAW_JSON_CHARS) {
        items.push({ line: entry.line, status: "REJECTED", error: "单条告警超过大小限制" });
        continue;
      }
      const redacted = redactRawAlert(entry.value);
      const payloadHash = hashPayload(redacted.payload);
      let normalized: ReturnType<typeof normalizeWazuhAlert>;
      try {
        normalized = rawSourceType === "WAZUH"
          ? normalizeWazuhAlert(rawJson)
          : normalizeJsonAlert(rawJson, rawSourceType);
      } catch {
        const rejectedRecord = await createRawAlertRecord({ sourceType: rawSourceType, payloadJson: redacted.payload, payloadHash });
        await updateRawAlertIngestResult({ id: rejectedRecord.id, status: "REJECTED", errorMessage: "告警内容无法标准化" });
        items.push({ line: entry.line, status: "REJECTED", error: "告警内容无法标准化" });
        continue;
      }
      const rawRecord = await createRawAlertRecord({ sourceType: rawSourceType, externalAlertId: normalized.input.externalAlertId, payloadJson: redacted.payload, payloadHash });

      try {
        const created = await createFromNormalized(normalized.input, actor, `jsonl:${batchId}:${entry.line}`);
        if (!created.ok && created.code === "DUPLICATE_EXTERNAL_ALERT") {
          await updateRawAlertIngestResult({ id: rawRecord.id, status: "DUPLICATE", caseId: created.existingCaseId, errorMessage: "外部告警已存在" });
          items.push({ line: entry.line, status: "DUPLICATE", caseId: created.existingCaseId, caseNumber: created.existingCaseNumber, error: "外部告警已存在" });
        } else if (!created.ok) {
          const message = sanitizeActionErrorMessage(created.error, BATCH_FALLBACK);
          await updateRawAlertIngestResult({ id: rawRecord.id, status: "REJECTED", errorMessage: message });
          items.push({ line: entry.line, status: "REJECTED", error: message });
        } else {
          await updateRawAlertIngestResult({ id: rawRecord.id, status: "CREATED", caseId: created.case.id });
          items.push({ line: entry.line, status: "CREATED", caseId: created.case.id, caseNumber: created.case.caseNumber });
        }
      } catch {
        await updateRawAlertIngestResult({ id: rawRecord.id, status: "REJECTED", errorMessage: BATCH_FALLBACK });
        items.push({ line: entry.line, status: "REJECTED", error: BATCH_FALLBACK });
      }
    }

    const created = items.filter((item) => item.status === "CREATED").length;
    const duplicate = items.filter((item) => item.status === "DUPLICATE").length;
    const rejected = items.filter((item) => item.status === "REJECTED").length;
    return { ok: true, total: items.length, created, duplicate, rejected, items: items.sort((a, b) => a.line - b.line) };
  } catch {
    return { ok: false, error: unknownActionErrorMessage(BATCH_FALLBACK) };
  }
}
