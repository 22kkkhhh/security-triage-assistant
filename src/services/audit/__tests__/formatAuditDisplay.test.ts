import { describe, expect, it } from "vitest";
import {
  formatAuditActionLabel,
  formatAuditActorName,
  formatAuditChangesForDisplay,
  formatHandoffNoteBody,
} from "@/services/audit/formatAuditDisplay";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";

function log(
  partial: Partial<CaseAuditLogView> &
    Pick<CaseAuditLogView, "actionType" | "summary">,
): CaseAuditLogView {
  return {
    id: "a1",
    caseId: "c1",
    actorType: "MANUAL",
    actorId: null,
    actorName: "王研判",
    changes: null,
    metadata: null,
    operationId: "should-not-leak",
    createdAt: "2026-08-08T12:25:00.000Z",
    ...partial,
  };
}

describe("formatAuditDisplay", () => {
  it("Action / Actor 中文化，不暴露内部枚举与 operationId", () => {
    expect(formatAuditActionLabel("STATUS_CHANGED")).toBe("修改案件状态");
    expect(formatAuditActionLabel("REPORT_EXPORTED")).toBe("导出调查报告");
    expect(formatAuditActionLabel("CASE_CREATED")).toBe("创建研判案件");

    const system = log({
      actionType: "CASE_CREATED",
      summary: "创建研判案件",
      actorType: "SYSTEM",
      actorName: "系统",
      changes: { caseNumber: "INC-20260808-003" },
    });
    expect(formatAuditActorName(system)).toBe("系统");
    const lines = formatAuditChangesForDisplay(system).join("\n");
    expect(lines).toContain("INC-20260808-003");
    expect(lines).not.toContain("operationId");
    expect(lines).not.toContain("should-not-leak");
  });

  it("STATUS / Checklist / Business / HumanReview / Risk 中文化", () => {
    const status = formatAuditChangesForDisplay(
      log({
        actionType: "STATUS_CHANGED",
        summary: "x",
        changes: {
          from: "INVESTIGATING",
          to: "PENDING_BUSINESS_CONFIRMATION",
        },
      }),
    ).join("\n");
    expect(status).toContain("研判中");
    expect(status).toContain("待业务确认");
    expect(status).not.toContain("INVESTIGATING");

    const checklist = formatAuditChangesForDisplay(
      log({
        actionType: "CHECKLIST_COMPLETED",
        summary: "x",
        changes: { itemId: "1", label: "核实账号实际使用人" },
      }),
    ).join("\n");
    expect(checklist).toContain("核实账号实际使用人");

    const bc = formatAuditChangesForDisplay(
      log({
        actionType: "BUSINESS_CONTEXT_UPDATED",
        summary: "x",
        changes: {
          businessLegitimacy: { from: "UNKNOWN", to: "AUTHORIZED" },
        },
      }),
    ).join("\n");
    expect(bc).toContain("业务合理性");
    expect(bc).toContain("尚未判断");
    expect(bc).toContain("已授权");
    expect(bc).not.toContain("AUTHORIZED");

    const hr = formatAuditChangesForDisplay(
      log({
        actionType: "HUMAN_REVIEW_UPDATED",
        summary: "x",
        changes: {
          finalConclusion: {
            from: null,
            to: "SUSPECTED_SECURITY_INCIDENT",
          },
          humanRiskLevel: { from: null, to: "HIGH" },
        },
      }),
    ).join("\n");
    expect(hr).toContain("疑似安全事件");
    expect(hr).toContain("高风险");
    expect(hr).toContain("暂无法评级");
    expect(hr).not.toContain("HIGH");
    expect(hr).not.toContain("UNKNOWN");
  });

  it("HANDOFF 正文优先 metadata.note，fallback summary", () => {
    const withNote = log({
      actionType: "HANDOFF_NOTE_ADDED",
      summary: "摘要…",
      metadata: { note: "完整交接正文\n下一班重点核查" },
    });
    expect(formatHandoffNoteBody(withNote)).toContain("完整交接正文");

    const fallback = log({
      actionType: "HANDOFF_NOTE_ADDED",
      summary: "只有摘要",
      metadata: null,
    });
    expect(formatHandoffNoteBody(fallback)).toBe("只有摘要");
  });

  it("未填写研判人员回退", () => {
    expect(
      formatAuditActorName(
        log({
          actionType: "STATUS_CHANGED",
          summary: "x",
          actorName: null,
        }),
      ),
    ).toBe("未填写研判人员");
  });
});
