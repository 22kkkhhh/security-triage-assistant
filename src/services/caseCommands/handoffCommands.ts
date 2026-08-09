/**
 * 交接说明 Semantic Command：仅 append Audit，不改 caseState / Timeline / Report。
 * Actor 必须由调用方显式传入（USER / SYSTEM）。
 */

import {
  buildHandoffAudit,
  type AuditActor,
} from "@/services/audit/auditEventBuilder";
import {
  assertTrustedCommandActor,
  validateOperationOwnership,
} from "@/services/audit/operationOwnership";
import {
  appendCaseAudit,
  findAuditByOperationId,
  runInTransaction,
} from "@/services/persistence/auditRepository";
import { getCaseById } from "@/services/persistence/caseRepository";
import type { CommandResult } from "./types";

/** 添加交接记录（HANDOFF_NOTE_ADDED） */
export async function addHandoffNoteCommand(input: {
  caseId: string;
  note: string;
  operationId: string;
  actor: AuditActor;
}): Promise<CommandResult> {
  let trusted;
  try {
    trusted = assertTrustedCommandActor(input.actor);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Actor 无效",
    };
  }

  const operationId = input.operationId.trim();
  if (!operationId) {
    return { ok: false, error: "operationId 无效" };
  }

  const existing = await findAuditByOperationId(operationId);
  if (existing) {
    const ownership = validateOperationOwnership({
      existing,
      expectedActor: trusted,
      caseId: input.caseId,
      actionType: "HANDOFF_NOTE_ADDED",
    });
    if (!ownership.ok) {
      return {
        ok: false,
        error: ownership.error,
        code: ownership.code === "FORBIDDEN" ? "FORBIDDEN" : undefined,
      };
    }
    const record = await getCaseById(input.caseId);
    if (!record) return { ok: false, error: "案件不存在" };
    return {
      ok: true,
      alreadyApplied: true,
      case: record,
      audit: existing,
    };
  }

  const record = await getCaseById(input.caseId);
  if (!record) return { ok: false, error: "案件不存在" };

  let built;
  try {
    built = buildHandoffAudit({
      note: input.note,
      actor: trusted,
      operationId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "交接说明无效";
    return { ok: false, error: message };
  }

  try {
    const audit = await runInTransaction(async (tx) =>
      appendCaseAudit(
        {
          caseId: input.caseId,
          ...built,
        },
        tx,
      ),
    );
    const saved = await getCaseById(input.caseId);
    if (!saved) return { ok: false, error: "案件不存在" };
    return {
      ok: true,
      alreadyApplied: false,
      case: saved,
      audit,
    };
  } catch (error) {
    const raced = await findAuditByOperationId(operationId);
    if (raced) {
      const ownership = validateOperationOwnership({
        existing: raced,
        expectedActor: trusted,
        caseId: input.caseId,
        actionType: "HANDOFF_NOTE_ADDED",
      });
      if (ownership.ok) {
        const saved = await getCaseById(input.caseId);
        if (saved) {
          return {
            ok: true,
            alreadyApplied: true,
            case: saved,
            audit: raced,
          };
        }
      }
    }
    const message =
      error instanceof Error ? error.message : "交接记录添加失败";
    return { ok: false, error: message };
  }
}
