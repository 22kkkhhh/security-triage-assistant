/**
 * 客户端安全的结构化 diff 判断（无 Prisma / Node 依赖）。
 */

import type { BusinessContext, HumanReview } from "@/domain/types";

const STRUCTURED_BC_FIELDS = [
  "plannedTaskStatus",
  "changeTicketStatus",
  "ownerVerification",
  "businessLegitimacy",
] as const;

export function hasStructuredBusinessContextChange(
  from: BusinessContext,
  to: BusinessContext,
): boolean {
  return STRUCTURED_BC_FIELDS.some((field) => from[field] !== to[field]);
}

export function hasStructuredHumanReviewChange(
  from: HumanReview | null,
  to: HumanReview | null,
): boolean {
  return (
    (from?.finalConclusion ?? null) !== (to?.finalConclusion ?? null) ||
    (from?.humanRiskLevel ?? null) !== (to?.humanRiskLevel ?? null)
  );
}
