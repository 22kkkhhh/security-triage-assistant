/**
 * v1.5 Workstream 2：Case Context 保存成功 → compliance UI refresh 契约。
 * 不引入渲染库；校验 router.refresh 接线与 Client 不跑 resolver。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Case Context → Compliance UI Refresh（router.refresh）", () => {
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const page = readSrc("app/(app)/cases/[id]/page.tsx");
  const autosave = readSrc("hooks/useCaseAutosave.ts");

  it("BusinessContext 语义保存成功路径调用 router.refresh", () => {
    expect(workbench).toContain("refreshComplianceAfterContextPersist");
    expect(workbench).toContain("router.refresh()");
    expect(workbench).toMatch(
      /updateBusinessContextAction[\s\S]*?mergeReturnedAudit\(result\.audit\);\n\s*refreshComplianceAfterContextPersist\(\);/,
    );
  });

  it("BusinessContext 保存失败路径不调用 refreshComplianceAfterContextPersist", () => {
    const match = workbench.match(
      /if \(!result\.ok\) \{[\s\S]*?业务核查信息更新失败[\s\S]*?return;\n\s*\}\n\s*commitExternalSave/,
    );
    expect(match).toBeTruthy();
    expect(match![0]).not.toContain("refreshComplianceAfterContextPersist()");
  });

  it("VIEWER：无写权限时早退，不发起语义/Snapshot 保存", () => {
    expect(workbench).toContain(
      "if (structured && !capabilities.canWriteBusinessContext) return;",
    );
    expect(workbench).toContain(
      "if (!structured && !capabilities.canSnapshotWrite) return;",
    );
  });

  it("Snapshot businessContext 保存成功经 onSaved 触发 refresh", () => {
    expect(autosave).toContain("onSaved?: (patch: SnapshotPatchInput) => void");
    expect(autosave).toContain("onSavedRef.current?.(patch)");
    expect(workbench).toContain("onSaved: (patch) => {");
    expect(workbench).toContain("if (patch.businessContext)");
  });

  it("Client 不调用 compliance runtime resolver / Prisma", () => {
    expect(workbench).not.toContain("resolveCaseCompliance");
    expect(workbench).not.toContain("refreshCaseComplianceRuntimeViews");
    expect(workbench).not.toContain("loadCaseComplianceWorkbenchViews");
    expect(workbench).not.toContain('from "@/lib/prisma"');
    expect(workbench).not.toContain("@/generated/prisma");
  });

  it("Server page 仍经服务端 loader 提供 compliance props（refresh 后复用）", () => {
    expect(page).toContain("loadCaseComplianceWorkbenchViews");
    expect(page).toContain("compliancePanel={complianceViews.panel}");
    expect(page).toContain("complianceChecklist={complianceViews.checklist}");
  });

  it("加入核查清单 handler 不触发 compliance refresh", () => {
    const match = workbench.match(
      /const handleAddComplianceSuggestion = \([\s\S]*?\n  \};\n\n  const handleBack/,
    );
    expect(match).toBeTruthy();
    expect(match![0]).toContain("runChecklistCommand");
    expect(match![0]).not.toContain("refreshComplianceAfterContextPersist()");
  });

  it("KNOWLEDGE_SUGGESTED checklist 合并逻辑仍保留", () => {
    expect(workbench).toContain("mergeChecklistOnRestore");
    expect(workbench).toContain("KNOWLEDGE_SUGGESTED");
    expect(workbench).toContain("hasSuggestionInChecklist");
  });
});

describe("Case A/B UI regression（合规面板接入）", () => {
  it("Workbench 仍挂载合规参考与建议核查面板", () => {
    const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
    expect(workbench).toContain(
      "<CaseCompliancePanel view={compliancePanel} />",
    );
    expect(workbench).toContain("complianceChecklist");
    expect(workbench).toContain("CaseComplianceChecklistPanel");
  });
});
