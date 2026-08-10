/**
 * Semantic Command canonical state builders (v1.5 M4).
 *
 * Server builds persistence state from persisted Case + minimal command intent.
 * Browser callers never submit a complete Case state for semantic mutations.
 */

import type {
  BusinessContext,
  CaseStatus,
  ChecklistItem,
  ChecklistSourceRef,
  SecurityDomain,
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

/** Minimal checklist add intent — server owns completed/origin/relatedRuleId. */
export type ChecklistAddSemanticIntent = {
  id: string;
  category: SecurityDomain;
  label: string;
  note?: string | null;
  sourceKind?: "KNOWLEDGE_SUGGESTED";
  sourceRef?: ChecklistSourceRef;
};

/** Minimal timeline append intent — server forces source=HUMAN. */
export type TimelineEventSemanticIntent = {
  id: string;
  occurredAt: string;
  eventType: string;
  title: string;
  description: string;
  operator: string | null;
};

/** Build server-owned ChecklistItem from minimal add intent. */
export function buildChecklistItemFromAddIntent(
  intent: ChecklistAddSemanticIntent,
): ChecklistItem {
  const base: ChecklistItem = {
    id: intent.id,
    category: intent.category,
    label: intent.label,
    completed: false,
    note: intent.note ?? null,
    origin: "MANUAL",
    relatedRuleId: null,
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

/** Build HUMAN TimelineEvent from minimal intent. */
export function buildTimelineEventFromIntent(
  intent: TimelineEventSemanticIntent,
): TimelineEvent {
  return {
    id: intent.id,
    occurredAt: intent.occurredAt,
    eventType: intent.eventType,
    title: intent.title,
    description: intent.description,
    operator: intent.operator,
    source: "HUMAN",
  };
}

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
  itemIntent: ChecklistAddSemanticIntent,
): {
  nextState: SaveCaseStateInput;
  normalizedItem: ChecklistItem;
} {
  const normalizedItem = buildChecklistItemFromAddIntent(itemIntent);
  return {
    nextState: {
      ...copyPersistedCaseState(record),
      checklist: [...record.caseState.checklist, normalizedItem],
    },
    normalizedItem,
  };
}

export function buildTimelineAddCanonicalState(
  record: PersistedCase,
  eventIntent: TimelineEventSemanticIntent,
): SaveCaseStateInput {
  return {
    ...copyPersistedCaseState(record),
    timeline: [
      ...record.caseState.timeline,
      buildTimelineEventFromIntent(eventIntent),
    ],
  };
}
