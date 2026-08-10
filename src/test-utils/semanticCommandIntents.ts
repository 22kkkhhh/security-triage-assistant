import type {
  BusinessContext,
  ChecklistItem,
  TimelineEvent,
} from "@/domain/types";
import type {
  BusinessContextSemanticPatch,
  ChecklistAddSemanticIntent,
  TimelineEventSemanticIntent,
} from "@/services/caseCommands";

export function businessContextSemanticPatch(
  context: BusinessContext,
): BusinessContextSemanticPatch {
  return {
    plannedTaskStatus: context.plannedTaskStatus,
    changeTicketStatus: context.changeTicketStatus,
    ownerVerification: context.ownerVerification,
    businessLegitimacy: context.businessLegitimacy,
  };
}

export function checklistAddSemanticIntent(
  checklist: ChecklistItem[],
  itemId: string,
): ChecklistAddSemanticIntent {
  const item = checklist.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Missing checklist item: ${itemId}`);

  const intent: ChecklistAddSemanticIntent = {
    id: item.id,
    category: item.category,
    label: item.label,
    note: item.note,
  };
  if (item.sourceKind === "KNOWLEDGE_SUGGESTED" && item.sourceRef) {
    return {
      ...intent,
      sourceKind: "KNOWLEDGE_SUGGESTED",
      sourceRef: item.sourceRef,
    };
  }
  return intent;
}

export function timelineEventSemanticIntent(
  timeline: TimelineEvent[],
  eventId: string,
): TimelineEventSemanticIntent {
  const event = timeline.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Missing timeline event: ${eventId}`);
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    operator: event.operator,
  };
}
