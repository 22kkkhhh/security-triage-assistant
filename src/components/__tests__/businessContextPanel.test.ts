/**
 * v1.5 M2 Workstream B：BusinessContext UI 可用性契约。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  businessContextFieldNeedsAttention,
  businessContextSaveStatusLabel,
  isMissingText,
  isUnknownStatus,
} from "@/components/BusinessContextPanel";
import type { BusinessContext } from "@/domain/types";
import type { AutosaveState } from "@/hooks/autosaveState";
import { caseA, caseB } from "@/domain/demo";

const root = path.resolve(import.meta.dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

const sparse: BusinessContext = {
  plannedTaskStatus: "UNKNOWN",
  changeTicketStatus: "UNKNOWN",
  changeTicketId: null,
  businessOwner: null,
  ownerVerification: "UNKNOWN",
  businessLegitimacy: "UNKNOWN",
  businessJustification: null,
};

describe("BusinessContext missing / unknown helpers", () => {
  it("空文本与 UNKNOWN 判定", () => {
    expect(isMissingText(null)).toBe(true);
    expect(isMissingText("  ")).toBe(true);
    expect(isMissingText("CHG-1")).toBe(false);
    expect(isUnknownStatus("UNKNOWN")).toBe(true);
    expect(isUnknownStatus("CONFIRMED")).toBe(false);
  });

  it("字段自身待补充（不推导合规 ContextRequirement）", () => {
    expect(
      businessContextFieldNeedsAttention("changeTicketId", sparse),
    ).toBe(true);
    expect(
      businessContextFieldNeedsAttention("businessOwner", sparse),
    ).toBe(true);
    expect(
      businessContextFieldNeedsAttention("ownerVerification", sparse),
    ).toBe(true);
    expect(
      businessContextFieldNeedsAttention("businessLegitimacy", sparse),
    ).toBe(true);
    expect(
      businessContextFieldNeedsAttention(
        "changeTicketId",
        caseA.businessContext,
      ),
    ).toBe(false);
  });
});

describe("BusinessContext save status label", () => {
  const base: AutosaveState = {
    status: "IDLE",
    lastSavedAt: null,
    errorMessage: null,
    saveSeq: 0,
    completedSeq: 0,
    dirtySeq: 0,
    savedDirtySeq: 0,
  };

  it("saving / saved / failed 文案", () => {
    expect(
      businessContextSaveStatusLabel({ ...base, status: "SAVING" }),
    ).toBe("保存中…");
    expect(
      businessContextSaveStatusLabel({ ...base, status: "DIRTY" }),
    ).toBe("待保存…");
    expect(
      businessContextSaveStatusLabel({
        ...base,
        status: "SAVED",
        lastSavedAt: "2026-08-08T10:00:00.000Z",
      }),
    ).toMatch(/^已保存 /);
    expect(
      businessContextSaveStatusLabel({
        ...base,
        status: "ERROR",
        errorMessage: "网络错误",
      }),
    ).toContain("保存失败");
  });
});

describe("BusinessContextPanel UI 契约", () => {
  const src = readSrc("components/BusinessContextPanel.tsx");

  it("分组：任务与变更 / 授权与负责人 / 业务合理性", () => {
    expect(src).toContain("任务与变更");
    expect(src).toContain("授权与负责人");
    expect(src).toContain("业务合理性");
  });

  it("现有字段全部展示", () => {
    expect(src).toContain("plannedTaskStatus");
    expect(src).toContain("changeTicketStatus");
    expect(src).toContain("changeTicketId");
    expect(src).toContain("businessOwner");
    expect(src).toContain("ownerVerification");
    expect(src).toContain("businessLegitimacy");
    expect(src).toContain("businessJustification");
  });

  it("helper text：分组说明紧凑；未知不等于正常", () => {
    expect(src).toContain("确认计划任务或变更工单");
    expect(src).toContain("未知不等于正常");
    expect(src).toContain("信息不足时保持「未知 / 未填写」");
    expect(src).not.toMatch(/已违法|法律责任成立|合规结论：不合规/);
  });

  it("待补充徽标与 capability 只读", () => {
    expect(src).toContain("待补充");
    expect(src).toContain("canWriteStructured");
    expect(src).toContain("canWriteSnapshot");
    expect(src).toContain("只读查看");
  });

  it("保存状态展示 saving/saved/failed", () => {
    expect(src).toContain("保存中…");
    expect(src).toContain("已保存");
    expect(src).toContain("保存失败");
    expect(src).toContain("saveState");
    expect(src).toContain("onRetrySave");
  });

  it("FieldBlock label 通过 htmlFor/id 关联控件", () => {
    expect(src).toContain("htmlFor={controlId}");
    expect(src).toContain('id="bc-planned-task-status"');
    expect(src).toContain('id="bc-change-ticket-id"');
    expect(src).toContain('id="bc-business-justification"');
  });

  it("语义命令 pending 显示提交中，不混入 autosave domain state", () => {
    expect(src).toContain("commandPending");
    expect(src).toContain("提交中…");
  });

  it("不导入 Prisma / compliance resolver", () => {
    expect(src).not.toContain("resolveCaseCompliance");
    expect(src).not.toContain("refreshCaseComplianceRuntimeViews");
    expect(src).not.toContain("@/lib/prisma");
    expect(src).not.toContain("@/generated/prisma");
  });
});

describe("Workbench glue + M1 / Viewer / Case A·B regression", () => {
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");

  it("最小 glue：传入 saveState / onRetrySave；保留 M1 router.refresh", () => {
    expect(workbench).toContain("<BusinessContextPanel");
    expect(workbench).toContain("saveState={saveState}");
    expect(workbench).toContain("onRetrySave={retrySave}");
    expect(workbench).toContain("router.refresh()");
    expect(workbench).toContain("refreshComplianceAfterContextPersist");
    expect(workbench).not.toContain("resolveCaseCompliance");
  });

  it("VIEWER：BusinessContext 写权限仍由 capability 控制", () => {
    expect(workbench).toContain("canWriteBusinessContext");
    expect(workbench).toContain(
      "if (structured && !capabilities.canWriteBusinessContext) return;",
    );
    expect(readSrc("components/BusinessContextPanel.tsx")).toContain(
      "canWriteStructured",
    );
  });

  it("Case A/B demo 仍含完整 BusinessContext 字段", () => {
    for (const draft of [caseA, caseB]) {
      expect(draft.businessContext).toHaveProperty("plannedTaskStatus");
      expect(draft.businessContext).toHaveProperty("changeTicketStatus");
      expect(draft.businessContext).toHaveProperty("changeTicketId");
      expect(draft.businessContext).toHaveProperty("businessOwner");
      expect(draft.businessContext).toHaveProperty("ownerVerification");
      expect(draft.businessContext).toHaveProperty("businessLegitimacy");
      expect(draft.businessContext).toHaveProperty("businessJustification");
    }
  });
});
