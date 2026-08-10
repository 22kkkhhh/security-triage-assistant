/**
 * Semantic Command canonical state builders (v1.5 M4).
 *
 * Server builds persistence state from persisted Case + minimal command intent.
 * Legacy client full-state payloads are transitional inputs only — never persisted as-is.
 */

import type {
  BusinessContext,
  CaseStatus,
  ChecklistItem,
  TimelineEvent,
} from "@/domain/types";
import type { PersistedCase, SaveCaseStateInput } from "@/services/persistence/types";

export const STRUCTURED_BC_FIELDS = [
  "plannedTaskStatus",
  "changeTicketStatus",
  "ownerVerification",
  "businessLegitimacy",
] as const;

export type BusinessContextSemanticPatch = Pick<
  BusinessContext,
  (typeof STRUCTURED_BC_FIELDS)[number]
>;

/** Copy persisted case into SaveCaseStateInput without mutation. */
export function copyPersistedCaseState(record: PersistedCase): SaveCaseStateInput {
  return {
    caseData: record.caseState.caseData,
    businessContext: record.caseState.businessContext,
    checklist: record.caseState.checklist,
    humanReview: record.caseState.humanReview,
    timeline: record.caseState.timeline,
    suggestedRiskLevel: record.suggestedRiskLevel,
    status: record.status,
  };
}

export function buildStatusCommandCanonicalState(
  record: PersistedCase,
  nextStatus: CaseStatus,
): SaveCaseStateInput {
  return {
    ...copyPersistedCaseState(record),
    status: nextStatus,
  };
}

/**
 * transitional / remove after Cursor caller migration
 * Extract only authorized structured BusinessContext fields from legacy payload.
 */
export function extractLegacyBusinessContextPatch(
  legacyBusinessContext: BusinessContext,
): BusinessContextSemanticPatch {
  return {
    plannedTaskStatus: legacyBusinessContext.plannedTaskStatus,
    changeTicketStatus: legacyBusinessContext.changeTicketStatus,
    ownerVerification: legacyBusinessContext.ownerVerification,
    businessLegitimacy: legacyBusinessContext.businessLegitimacy,
  };
}

export function buildBusinessContextCommandCanonicalState(
  record: PersistedCase,
  patch: BusinessContextSemanticPatch,
): SaveCaseStateInput {
  const nextBusinessContext: BusinessContext = {
    ...record.caseState.businessContext,
    ...patch,
  };
  return {
    ...copyPersistedCaseState(record),
    businessContext: nextBusinessContext,
  };
}

/**
 * transitional / remove after Cursor caller migration
 * Extract target checklist item intent from legacy full-state payload.
 */
export function extractLegacyChecklistItemIntent(
  legacyChecklist: ChecklistItem[],
  itemId: string,
): ChecklistItem | null {
  return legacyChecklist.find((item) => item.id === itemId) ?? null;
}

/**
 * Server-owned normalization for checklist add intent.
 * Strips smuggled completed state and non-MANUAL origins.
 */
export function normalizeChecklistAddIntent(intent: ChecklistItem): ChecklistItem | null {
  if (intent.origin !== "MANUAL") {
    return null;
  }
  const base: ChecklistItem = {
    id: intent.id,
    category: intent.category,
    label: intent.label,
    completed: false,
    note: intent.note ?? null,
    origin: "MANUAL",
    relatedRuleId: intent.relatedRuleId ?? null,
  };
  if (
    intent.sourceKind === "KNOWLEDGE_SUGGESTED" &&
    intent.sourceRef?.suggestionKey
  ) {
    return {
      ...base,
      sourceKind: "KNOWLEDGE_SUGGESTED",
      sourceRef: intent.sourceRef,
    };
  }
  return base;
}

export function buildChecklistCompleteCanonicalState(
  record: PersistedCase,
  itemId: string,
): {
  nextState: SaveCaseStateInput;
  oldItem: ChecklistItem | undefined;
  nextItem: ChecklistItem | undefined;
} {
  const oldItems = record.caseState.checklist;
  const oldItem = oldItems.find((item) => item.id === itemId);
  const nextChecklist = oldItems.map((item) =>
    item.id === itemId ? { ...item, completed: true } : item,
  );
  return {
    nextState: {
      ...copyPersistedCaseState(record),
      checklist: nextChecklist,
    },
    oldItem,
    nextItem: nextChecklist.find((item) => item.id === itemId),
  };
}

export function buildChecklistReopenCanonicalState(
  record: PersistedCase,
  itemId: string,
): {
  nextState: SaveCaseStateInput;
  oldItem: ChecklistItem | undefined;
  nextItem: ChecklistItem | undefined;
} {
  const oldItems = record.caseState.checklist;
  const oldItem = oldItems.find((item) => item.id === itemId);
  const nextChecklist = oldItems.map((item) =>
    item.id === itemId ? { ...item, completed: false } : item,
  );
  return {
    nextState: {
      ...copyPersistedCaseState(record),
      checklist: nextChecklist,
    },
    oldItem,
    nextItem: nextChecklist.find((item) => item.id === itemId),
  };
}

export function buildChecklistDeleteCanonicalState(
  record: PersistedCase,
  itemId: string,
): {
  nextState: SaveCaseStateInput;
  oldItem: ChecklistItem | undefined;
  deleted: boolean;
} {
  const oldItems = record.caseState.checklist;
  const oldItem = oldItems.find((item) => item.id === itemId);
  const nextChecklist = oldItems.filter((item) => item.id !== itemId);
  return {
    nextState: {
      ...copyPersistedCaseState(record),
      checklist: nextChecklist,
    },
    oldItem,
    deleted: oldItem !== undefined,
  };
}

export function buildChecklistAddCanonicalState(
  record: PersistedCase,
  itemIntent: ChecklistItem,
): {
  nextState: SaveCaseStateInput;
  normalizedItem: ChecklistItem | null;
} {
  const normalizedItem = normalizeChecklistAddIntent(itemIntent);
  if (!normalizedItem) {
    return {
      nextState: copyPersistedCaseState(record),
      normalizedItem: null,
    };
  }
  return {
    nextState: {
      ...copyPersistedCaseState(record),
      checklist: [...record.caseState.checklist, normalizedItem],
    },
    normalizedItem,
  };
}

/**
 * transitional / remove after Cursor caller migration
 * Extract target HUMAN timeline event from legacy full-state payload.
 */
export function extractLegacyTimelineEventIntent(
  legacyTimeline: TimelineEvent[],
  eventId: string,
): TimelineEvent | null {
  return legacyTimeline.find((event) => event.id === eventId) ?? null;
}

export function buildTimelineAddCanonicalState(
  record: PersistedCase,
  eventIntent: TimelineEvent,
): SaveCaseStateInput {
  return {
    ...copyPersistedCaseState(record),
    timeline: [...record.caseState.timeline, eventIntent],
  };
}
