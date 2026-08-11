import { describe, expect, it } from "vitest";
import {
  createChecklistItemFromInvestigationLead,
  hasInvestigationLeadInChecklist,
  isInvestigationLeadChecklistItem,
} from "@/services/checklist/fromInvestigationLead";
import {
  investigationLeadChecklistCategories,
  investigationLeadChecklistLabels,
  investigationLeadKey,
  isInvestigationLeadCode,
} from "@/services/checklist/investigationLeadCanonical";
import type { ChecklistItem } from "@/domain/types";

describe("investigationLeadCanonical", () => {
  it("lead code → canonical label/category/key", () => {
    expect(investigationLeadKey("COMPARE_SHARED_SYSTEM_ACTIVITY")).toBe(
      "INVESTIGATION_LEAD:COMPARE_SHARED_SYSTEM_ACTIVITY",
    );
    expect(
      investigationLeadChecklistLabels.COMPARE_SHARED_SYSTEM_ACTIVITY,
    ).toBe("对比关联案件在共同业务系统中的访问时间、操作范围与上下文");
    expect(
      investigationLeadChecklistCategories.COMPARE_SHARED_SYSTEM_ACTIVITY,
    ).toBe("IDENTITY");
    expect(investigationLeadChecklistCategories.VERIFY_SOURCE_IP_OWNERSHIP).toBe(
      "NETWORK",
    );
    expect(
      investigationLeadChecklistCategories.CHECK_DUPLICATE_ALERT_PROVENANCE,
    ).toBe("BUSINESS");
    expect(isInvestigationLeadCode("VERIFY_RECURRING_ACCOUNT")).toBe(true);
    expect(isInvestigationLeadCode("FAKE_LEAD")).toBe(false);
  });
});

describe("fromInvestigationLead", () => {
  it("creates MANUAL + INVESTIGATION_LEAD provenance snapshot", () => {
    const item = createChecklistItemFromInvestigationLead(
      {
        leadCode: "COMPARE_SHARED_SYSTEM_ACTIVITY",
        relatedCaseIds: ["b", "a"],
        signals: [
          {
            code: "RECURRING_SYSTEM",
            value: "CRM_PROD",
            relatedCaseCount: 1,
            relatedCaseIds: ["a"],
          },
        ],
      },
      "test1",
    );
    expect(item.origin).toBe("MANUAL");
    expect(item.sourceKind).toBe("INVESTIGATION_LEAD");
    expect(item.category).toBe("IDENTITY");
    expect(item.label).toBe(
      investigationLeadChecklistLabels.COMPARE_SHARED_SYSTEM_ACTIVITY,
    );
    expect(item.sourceRef).toEqual({
      leadKey: "INVESTIGATION_LEAD:COMPARE_SHARED_SYSTEM_ACTIVITY",
      leadCode: "COMPARE_SHARED_SYSTEM_ACTIVITY",
      relatedCaseIds: ["a", "b"],
      signalCodes: ["RECURRING_SYSTEM"],
    });
    expect(isInvestigationLeadChecklistItem(item)).toBe(true);
  });

  it("hasInvestigationLeadInChecklist by leadKey", () => {
    const item = createChecklistItemFromInvestigationLead(
      {
        leadCode: "VERIFY_RECURRING_ACCOUNT",
        relatedCaseIds: ["x"],
      },
      "d1",
    );
    const items: ChecklistItem[] = [item];
    expect(
      hasInvestigationLeadInChecklist(
        items,
        "INVESTIGATION_LEAD:VERIFY_RECURRING_ACCOUNT",
      ),
    ).toBe(true);
    expect(
      hasInvestigationLeadInChecklist(
        items,
        "INVESTIGATION_LEAD:VERIFY_SOURCE_IP_OWNERSHIP",
      ),
    ).toBe(false);
  });
});
