import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Actionable Investigation Leads UI 契约", () => {
  const panel = readSrc("components/cases/RelatedCasesPanel.tsx");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const checklist = readSrc("components/ChecklistPanel.tsx");
  const actions = readSrc("app/(app)/cases/commandActions.ts");

  it("writer 可见加入按钮；Viewer 无按钮（capability 门控）", () => {
    expect(panel).toContain("canWriteChecklist");
    expect(panel).toContain("加入核查清单");
    expect(panel).toContain("已加入核查清单");
    expect(panel).toContain('data-testid="investigation-lead-add-button"');
    expect(workbench).toContain("addInvestigationLeadToChecklistAction");
    expect(workbench).toContain("pendingLeadKey");
    expect(workbench).toContain("acceptedLeadKeys");
  });

  it("Checklist badge = 历史线索", () => {
    expect(checklist).toContain("INVESTIGATION_LEAD");
    expect(checklist).toContain("历史线索");
    expect(checklist).toContain(
      'data-testid="checklist-badge-investigation-lead"',
    );
  });

  it("专用 Server Action；generic parse 拒绝 INVESTIGATION_LEAD", () => {
    expect(actions).toContain("addInvestigationLeadToChecklistAction");
    expect(actions).toContain("buildInvestigationIntelligence");
    expect(actions).toContain("loadRelatedCasesForCase");
    expect(actions).toMatch(
      /raw\.sourceKind !== "KNOWLEDGE_SUGGESTED"[\s\S]*核查事项来源无效/,
    );
  });
});
