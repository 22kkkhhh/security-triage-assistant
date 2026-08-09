import { describe, expect, it } from "vitest";
import { caseB } from "@/domain/demo";
import {
  resolveInvestigationContextEntryStatus,
  INVESTIGATION_CONTEXT_CATALOG_BY_KEY,
} from "@/domain/investigationContext";

describe("investigationContext domain", () => {
  it("resolveInvestigationContextEntryStatus 区分 MISSING 与 UNKNOWN", () => {
    const ownerConfirmed = INVESTIGATION_CONTEXT_CATALOG_BY_KEY.businessOwnerConfirmed;
    expect(resolveInvestigationContextEntryStatus(ownerConfirmed, caseB)).toBe(
      "UNKNOWN",
    );

    const planned = INVESTIGATION_CONTEXT_CATALOG_BY_KEY.plannedTaskStatus;
    expect(resolveInvestigationContextEntryStatus(planned, caseB)).toBe(
      "PRESENT",
    );
  });
});
