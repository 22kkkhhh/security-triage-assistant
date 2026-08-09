/**
 * Case Snapshot Autosave 写边界（v1.3 Step 0 / Step 6）。
 *
 * Snapshot 仅允许 silent 写入 allowlisted 非语义字段。
 * Semantic-owned 字段与责任人字段必须走 Semantic Command + Audit。
 */

import type {
  BusinessContext,
  ChecklistItem,
  HumanReview,
} from "@/domain/types";
import type { PersistedCase, SaveCaseStateInput } from "./types";

/** Snapshot 允许的业务上下文自由文本字段 */
export type CaseSnapshotBusinessContextPatch = {
  businessJustification?: string | null;
  changeTicketId?: string | null;
  businessOwner?: string | null;
};

/**
 * Snapshot 允许的人工研判自由文本字段。
 * reviewer / reviewedByUserId / finalConclusion / humanRiskLevel 均禁止。
 */
export type CaseSnapshotHumanReviewPatch = {
  conclusionNote?: string | null;
};

export type CaseSnapshotChecklistNotePatch = {
  checklistId: string;
  note: string | null;
};

/**
 * 客户端 Snapshot Autosave 载荷：allowlisted patch，不是完整 PersistedCaseState。
 */
export type CaseSnapshotPatch = {
  businessContext?: CaseSnapshotBusinessContextPatch;
  humanReview?: CaseSnapshotHumanReviewPatch;
  checklistNotes?: CaseSnapshotChecklistNotePatch[];
  baseUpdatedAt?: string | null;
};

const ROOT_KEYS = new Set([
  "businessContext",
  "humanReview",
  "checklistNotes",
  "baseUpdatedAt",
]);

const BC_KEYS = new Set([
  "businessJustification",
  "changeTicketId",
  "businessOwner",
]);

const HR_KEYS = new Set(["conclusionNote"]);

const CHECKLIST_NOTE_KEYS = new Set(["checklistId", "note"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
): string[] {
  return Object.keys(obj).filter((key) => !allowed.has(key));
}

function parseNullableString(
  value: unknown,
  field: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string") return { ok: true, value };
  return { ok: false, error: `${field} 必须为 string 或 null` };
}

function emptyHumanReview(): HumanReview {
  return {
    reviewer: null,
    reviewedByUserId: null,
    finalConclusion: null,
    humanRiskLevel: null,
    conclusionNote: null,
    adjustments: [],
    confirmedAt: null,
  };
}

/**
 * 运行时 allowlist 解析：未知字段 / Semantic-owned 字段一律 reject（不静默忽略）。
 */
export function parseCaseSnapshotPatch(
  raw: unknown,
): CaseSnapshotPatch | string {
  if (!isObject(raw)) return "Snapshot 载荷格式无效";

  const badRoot = unknownKeys(raw, ROOT_KEYS);
  if (badRoot.length > 0) {
    return `Snapshot 不允许字段：${badRoot.join(", ")}`;
  }

  const patch: CaseSnapshotPatch = {};

  if (raw.baseUpdatedAt !== undefined) {
    if (raw.baseUpdatedAt !== null && typeof raw.baseUpdatedAt !== "string") {
      return "baseUpdatedAt 无效";
    }
    patch.baseUpdatedAt = raw.baseUpdatedAt;
  }

  if (raw.businessContext !== undefined) {
    if (!isObject(raw.businessContext)) return "businessContext 无效";
    const bad = unknownKeys(raw.businessContext, BC_KEYS);
    if (bad.length > 0) {
      return `businessContext 不允许字段：${bad.join(", ")}`;
    }
    const bc: CaseSnapshotBusinessContextPatch = {};
    if (raw.businessContext.businessJustification !== undefined) {
      const v = parseNullableString(
        raw.businessContext.businessJustification,
        "businessJustification",
      );
      if (!v.ok) return v.error;
      bc.businessJustification = v.value;
    }
    if (raw.businessContext.changeTicketId !== undefined) {
      const v = parseNullableString(
        raw.businessContext.changeTicketId,
        "changeTicketId",
      );
      if (!v.ok) return v.error;
      bc.changeTicketId = v.value;
    }
    if (raw.businessContext.businessOwner !== undefined) {
      const v = parseNullableString(
        raw.businessContext.businessOwner,
        "businessOwner",
      );
      if (!v.ok) return v.error;
      bc.businessOwner = v.value;
    }
    if (Object.keys(bc).length > 0) {
      patch.businessContext = bc;
    }
  }

  if (raw.humanReview !== undefined) {
    if (!isObject(raw.humanReview)) return "humanReview 无效";
    const bad = unknownKeys(raw.humanReview, HR_KEYS);
    if (bad.length > 0) {
      return `humanReview 不允许字段：${bad.join(", ")}`;
    }
    const hr: CaseSnapshotHumanReviewPatch = {};
    if (raw.humanReview.conclusionNote !== undefined) {
      const v = parseNullableString(
        raw.humanReview.conclusionNote,
        "conclusionNote",
      );
      if (!v.ok) return v.error;
      hr.conclusionNote = v.value;
    }
    if (Object.keys(hr).length > 0) {
      patch.humanReview = hr;
    }
  }

  if (raw.checklistNotes !== undefined) {
    if (!Array.isArray(raw.checklistNotes)) return "checklistNotes 无效";
    const notes: CaseSnapshotChecklistNotePatch[] = [];
    const seen = new Set<string>();
    for (const item of raw.checklistNotes) {
      if (!isObject(item)) return "checklistNotes 项无效";
      const bad = unknownKeys(item, CHECKLIST_NOTE_KEYS);
      if (bad.length > 0) {
        return `checklistNotes 不允许字段：${bad.join(", ")}`;
      }
      if (typeof item.checklistId !== "string" || !item.checklistId.trim()) {
        return "checklistId 无效";
      }
      const id = item.checklistId.trim();
      if (seen.has(id)) {
        return `checklistId 重复：${id}`;
      }
      seen.add(id);
      if (item.note === undefined) return "checklist note 缺失";
      const note = parseNullableString(item.note, "checklist note");
      if (!note.ok) return note.error;
      notes.push({ checklistId: id, note: note.value });
    }
    if (notes.length > 0) {
      patch.checklistNotes = notes;
    }
  }

  return patch;
}

export function snapshotPatchHasFields(patch: CaseSnapshotPatch): boolean {
  return Boolean(
    patch.businessContext ||
      patch.humanReview ||
      (patch.checklistNotes && patch.checklistNotes.length > 0),
  );
}

function sameNullableString(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * 将 allowlisted patch 应用到 canonical case，构造完整 SaveCaseStateInput。
 * 不存在的 checklistId / 无实际变化时由调用方处理。
 */
export function applyCaseSnapshotPatch(
  canonical: PersistedCase,
  patch: CaseSnapshotPatch,
):
  | { ok: true; next: SaveCaseStateInput; changed: boolean }
  | { ok: false; error: string } {
  let businessContext: BusinessContext = {
    ...canonical.caseState.businessContext,
  };
  let humanReview: HumanReview | null = canonical.caseState.humanReview
    ? { ...canonical.caseState.humanReview }
    : null;
  let checklist: ChecklistItem[] = canonical.caseState.checklist.map((item) => ({
    ...item,
  }));
  let changed = false;

  if (patch.businessContext) {
    const p = patch.businessContext;
    if (
      p.businessJustification !== undefined &&
      !sameNullableString(
        businessContext.businessJustification,
        p.businessJustification,
      )
    ) {
      businessContext = {
        ...businessContext,
        businessJustification: p.businessJustification,
      };
      changed = true;
    }
    if (
      p.changeTicketId !== undefined &&
      !sameNullableString(businessContext.changeTicketId, p.changeTicketId)
    ) {
      businessContext = {
        ...businessContext,
        changeTicketId: p.changeTicketId,
      };
      changed = true;
    }
    if (
      p.businessOwner !== undefined &&
      !sameNullableString(businessContext.businessOwner, p.businessOwner)
    ) {
      businessContext = {
        ...businessContext,
        businessOwner: p.businessOwner,
      };
      changed = true;
    }
  }

  if (patch.humanReview) {
    const base = humanReview ?? emptyHumanReview();
    const p = patch.humanReview;
    let nextHr = { ...base };
    if (
      p.conclusionNote !== undefined &&
      !sameNullableString(base.conclusionNote, p.conclusionNote)
    ) {
      nextHr = { ...nextHr, conclusionNote: p.conclusionNote };
      changed = true;
    }
    humanReview = nextHr;
  }

  if (patch.checklistNotes) {
    for (const notePatch of patch.checklistNotes) {
      const idx = checklist.findIndex(
        (item) => item.id === notePatch.checklistId,
      );
      if (idx < 0) {
        return {
          ok: false,
          error: `核查项不存在：${notePatch.checklistId}`,
        };
      }
      const current = checklist[idx]!;
      if (!sameNullableString(current.note, notePatch.note)) {
        checklist = checklist.map((item, i) =>
          i === idx ? { ...item, note: notePatch.note } : item,
        );
        changed = true;
      }
    }
  }

  const next: SaveCaseStateInput = {
    caseData: canonical.caseState.caseData,
    businessContext,
    checklist,
    humanReview,
    timeline: canonical.caseState.timeline,
    suggestedRiskLevel: canonical.suggestedRiskLevel,
    status: canonical.status,
    baseUpdatedAt: patch.baseUpdatedAt ?? null,
  };

  return { ok: true, next, changed };
}

/** 合并连续 debounce 的 Snapshot patch（后写覆盖同名字段） */
export function mergeCaseSnapshotPatches(
  base: CaseSnapshotPatch,
  incoming: CaseSnapshotPatch,
): CaseSnapshotPatch {
  const checklistMap = new Map<string, string | null>();
  for (const item of base.checklistNotes ?? []) {
    checklistMap.set(item.checklistId, item.note);
  }
  for (const item of incoming.checklistNotes ?? []) {
    checklistMap.set(item.checklistId, item.note);
  }

  const merged: CaseSnapshotPatch = {};
  if (base.businessContext || incoming.businessContext) {
    merged.businessContext = {
      ...base.businessContext,
      ...incoming.businessContext,
    };
  }
  if (base.humanReview || incoming.humanReview) {
    merged.humanReview = {
      ...base.humanReview,
      ...incoming.humanReview,
    };
  }
  if (checklistMap.size > 0) {
    merged.checklistNotes = [...checklistMap.entries()].map(
      ([checklistId, note]) => ({ checklistId, note }),
    );
  }
  return merged;
}
