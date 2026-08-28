import { createHash } from "node:crypto";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { type AuditActor, systemActor } from "@/services/audit/auditEventBuilder";
import { createCaseWithAudit } from "@/services/caseCommands";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import type { ImportSourceType, NormalizedSecurityInput } from "@/services/normalization/types";
import { normalizeJsonAlert } from "./parseJsonAlert";
import { normalizeWazuhAlert } from "./wazuhAlertAdapter";
import { redactRawAlert } from "./redactRawAlert";
import { createRawAlertRecord, updateRawAlertIngestResult } from "@/services/persistence/rawAlertRepository";

const MAX_RAW_JSON_CHARS = 256_000;

export type AlertIngestResult = {
  status: "CREATED" | "DUPLICATE" | "REJECTED";
  rawAlertId?: string;
  caseId?: string;
  caseNumber?: string;
  error?: string;
};

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function createCaseFromNormalized(input: NormalizedSecurityInput, actor: AuditActor, operationId: string) {
  const caseName = input.alertName?.trim() || "安全告警研判案件";
  const draft = buildSecurityCaseDraft(input, "alert-ingest");
  const namedDraft = { ...draft, name: caseName, alert: { ...draft.alert, title: input.alertName?.trim() || caseName } };
  const analyzed = analyzeSecurityCase(namedDraft);
  return createCaseWithAudit({
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
  }, { actor, sourceType: input.sourceType, operationId });
}

/** Machine/user-neutral intake path shared by JSONL imports and signed webhooks. */
export async function ingestAlertObject(input: {
  value: Record<string, unknown>;
  sourceType: ImportSourceType;
  operationId: string;
  actor?: AuditActor;
}): Promise<AlertIngestResult> {
  const rawJson = JSON.stringify(input.value);
  if (rawJson.length > MAX_RAW_JSON_CHARS) return { status: "REJECTED", error: "单条告警超过大小限制" };
  const redacted = redactRawAlert(input.value);
  const payloadHash = hashPayload(redacted.payload);
  let normalized: ReturnType<typeof normalizeWazuhAlert>;
  try {
    normalized = input.sourceType === "WAZUH" ? normalizeWazuhAlert(rawJson) : normalizeJsonAlert(rawJson, input.sourceType);
  } catch {
    const rejected = await createRawAlertRecord({ sourceType: input.sourceType, payloadJson: redacted.payload, payloadHash });
    await updateRawAlertIngestResult({ id: rejected.id, status: "REJECTED", errorMessage: "告警内容无法标准化" });
    return { status: "REJECTED", rawAlertId: rejected.id, error: "告警内容无法标准化" };
  }
  const rawRecord = await createRawAlertRecord({ sourceType: input.sourceType, externalAlertId: normalized.input.externalAlertId, payloadJson: redacted.payload, payloadHash });
  try {
    const created = await createCaseFromNormalized(normalized.input, input.actor ?? systemActor(), input.operationId);
    if (created.ok && created.alreadyApplied) {
      await updateRawAlertIngestResult({ id: rawRecord.id, status: "DUPLICATE", caseId: created.case.id, errorMessage: "该批次告警已处理" });
      return { status: "DUPLICATE", rawAlertId: rawRecord.id, caseId: created.case.id, caseNumber: created.case.caseNumber, error: "该批次告警已处理" };
    }
    if (!created.ok && created.code === "DUPLICATE_EXTERNAL_ALERT") {
      await updateRawAlertIngestResult({ id: rawRecord.id, status: "DUPLICATE", caseId: created.existingCaseId, errorMessage: "外部告警已存在" });
      return { status: "DUPLICATE", rawAlertId: rawRecord.id, caseId: created.existingCaseId, caseNumber: created.existingCaseNumber, error: "外部告警已存在" };
    }
    if (!created.ok) {
      await updateRawAlertIngestResult({ id: rawRecord.id, status: "REJECTED", errorMessage: "案件创建失败" });
      return { status: "REJECTED", rawAlertId: rawRecord.id, error: "案件创建失败" };
    }
    await updateRawAlertIngestResult({ id: rawRecord.id, status: "CREATED", caseId: created.case.id });
    return { status: "CREATED", rawAlertId: rawRecord.id, caseId: created.case.id, caseNumber: created.case.caseNumber };
  } catch {
    await updateRawAlertIngestResult({ id: rawRecord.id, status: "REJECTED", errorMessage: "案件创建失败" });
    return { status: "REJECTED", rawAlertId: rawRecord.id, error: "案件创建失败" };
  }
}
