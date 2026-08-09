import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "@/domain/types";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";
import {
  categoryFromComplianceSuggestion,
  createChecklistItemFromComplianceSuggestion,
  findChecklistItemBySuggestionKey,
  hasSuggestionInChecklist,
} from "@/services/checklist/fromComplianceSuggestion";
import { mergeChecklistOnRestore } from "@/services/persistence/caseMapper";

function suggestion(
  overrides: Partial<CaseComplianceChecklistItem> &
    Pick<CaseComplianceChecklistItem, "key" | "kind" | "label">,
): CaseComplianceChecklistItem {
  return {
    sourceKey: overrides.sourceKey ?? overrides.key.split(":")[1] ?? "x",
    description: undefined,
    priority: 10,
    controlCodes: overrides.controlCodes ?? ["CTRL-BUSINESS-AUTH-01"],
    clauseRefs: overrides.clauseRefs ?? [
      { clauseKey: "article-27", documentCanonicalCode: "CN-DSL" },
    ],
    relevance: overrides.relevance ?? "INSUFFICIENT_CONTEXT",
    relationTypes: overrides.relationTypes ?? ["CONTROL_SUPPORT"],
    ruleIds: ["BUSINESS-001"],
    supportingRuleIds: [],
    evidenceIds: ["ev-1"],
    ...overrides,
  };
}

describe("createChecklistItemFromComplianceSuggestion", () => {
  it("写入 MANUAL + KNOWLEDGE_SUGGESTED provenance", () => {
    const item = createChecklistItemFromComplianceSuggestion(
      suggestion({
        key: "CONTEXT:changeTicketId",
        kind: "CONTEXT",
        label: "核实该操作是否存在有效授权工单",
      }),
      "test1",
    );
    expect(item.origin).toBe("MANUAL");
    expect(item.relatedRuleId).toBeNull();
    expect(item.completed).toBe(false);
    expect(item.sourceKind).toBe("KNOWLEDGE_SUGGESTED");
    expect(item.sourceRef).toMatchObject({
      suggestionKey: "CONTEXT:changeTicketId",
      kind: "CONTEXT",
      relevance: "INSUFFICIENT_CONTEXT",
    });
    expect(item.sourceRef?.controlCodes).toContain("CTRL-BUSINESS-AUTH-01");
    expect(item.id).toContain("CL-KS-");
  });

  it("按控制编码映射 category", () => {
    expect(
      categoryFromComplianceSuggestion({
        controlCodes: ["CTRL-IAM-AUTH-01"],
        kind: "CHECKLIST",
      }),
    ).toBe("IDENTITY");
    expect(
      categoryFromComplianceSuggestion({
        controlCodes: ["CTRL-NETWORK-BOUNDARY-01"],
        kind: "EVIDENCE",
      }),
    ).toBe("NETWORK");
    expect(
      categoryFromComplianceSuggestion({
        controlCodes: ["CTRL-DATA-EXPORT-01"],
        kind: "CONTEXT",
      }),
    ).toBe("DATA");
  });
});

describe("suggestionKey 去重", () => {
  it("同一 Case 内按 suggestionKey 识别已加入", () => {
    const created = createChecklistItemFromComplianceSuggestion(
      suggestion({
        key: "CHECKLIST:verify-ticket",
        kind: "CHECKLIST",
        label: "核实该操作是否存在有效授权工单",
      }),
      "a",
    );
    const items: ChecklistItem[] = [created];
    expect(hasSuggestionInChecklist(items, "CHECKLIST:verify-ticket")).toBe(
      true,
    );
    expect(hasSuggestionInChecklist(items, "CHECKLIST:verify-export")).toBe(
      false,
    );
    expect(
      findChecklistItemBySuggestionKey(items, "CHECKLIST:verify-ticket")?.id,
    ).toBe(created.id);
  });
});

describe("Knowledge 重算不修改历史合规建议 checklist", () => {
  it("mergeChecklistOnRestore 保留 KNOWLEDGE_SUGGESTED，即使 label 与 SYSTEM 相同", () => {
    const knowledge = createChecklistItemFromComplianceSuggestion(
      suggestion({
        key: "CHECKLIST:verify-owner",
        kind: "CHECKLIST",
        label: "联系业务负责人核实业务合理性",
        controlCodes: ["CTRL-BUSINESS-AUTH-01"],
      }),
      "ks1",
    );
    knowledge.completed = true;
    knowledge.note = "已电话确认";

    const systemFresh: ChecklistItem = {
      id: "CL-9",
      category: "BUSINESS",
      label: "联系业务负责人核实业务合理性",
      completed: false,
      note: null,
      origin: "SYSTEM",
      relatedRuleId: "BUSINESS-002",
    };

    const merged = mergeChecklistOnRestore([knowledge], [systemFresh]);
    expect(merged).toHaveLength(2);
    const kept = merged.find((i) => i.sourceKind === "KNOWLEDGE_SUGGESTED");
    expect(kept).toMatchObject({
      completed: true,
      note: "已电话确认",
      sourceRef: { suggestionKey: "CHECKLIST:verify-owner" },
    });
    expect(merged.some((i) => i.origin === "SYSTEM")).toBe(true);
  });

  it("suggestion 从视图消失后，已加入 checklist 仍保留", () => {
    const knowledge = createChecklistItemFromComplianceSuggestion(
      suggestion({
        key: "CONTEXT:destinationRegion",
        kind: "CONTEXT",
        label: "核实导出数据类型及数据去向",
        controlCodes: ["CTRL-DATA-EXPORT-01"],
      }),
      "gone",
    );
    // 重算后 fresh 不再包含任何项（模拟建议消失）
    const merged = mergeChecklistOnRestore([knowledge], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sourceRef?.suggestionKey).toBe(
      "CONTEXT:destinationRegion",
    );
  });
});
