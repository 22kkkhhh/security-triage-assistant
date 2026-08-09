import { describe, expect, it } from "vitest";
import { HANDOFF_NOTE_MAX_LENGTH } from "@/domain/audit";
import {
  asPlainText,
  buildCaseCreatedAudit,
  buildHandoffAudit,
  buildHumanReviewUpdatedAudit,
  buildStatusChangedAudit,
  manualActor,
  systemActor,
  truncateSummary,
} from "@/services/audit/auditEventBuilder";

describe("auditEventBuilder", () => {
  it("systemActor / manualActor 约定正确", () => {
    expect(systemActor()).toEqual({
      actorType: "SYSTEM",
      actorId: null,
      actorName: "系统",
    });
    expect(manualActor("王研判").actorName).toBe("王研判");
    expect(manualActor("").actorName).toBe("未填写研判人员");
    expect(manualActor(null).actorType).toBe("MANUAL");
    expect(manualActor(null).actorId).toBeNull();
  });

  it("CASE_CREATED 使用 SYSTEM 主体", () => {
    const event = buildCaseCreatedAudit({ caseNumber: "INC-20260808-003", actor: systemActor()
});
    expect(event.actionType).toBe("CASE_CREATED");
    expect(event.actorType).toBe("SYSTEM");
    expect(event.actorName).toBe("系统");
    expect(event.summary).toContain("INC-20260808-003");
  });

  it("STATUS_CHANGED 使用中文摘要且不展开整案", () => {
    const event = buildStatusChangedAudit({
      from: "INVESTIGATING",
      to: "PENDING_BUSINESS_CONFIRMATION",
      actor: manualActor("王研判"),
    });
    expect(event.actorType).toBe("MANUAL");
    expect(event.summary).toBe("研判中 → 待业务确认");
    expect(event.changes).toEqual({
      from: "INVESTIGATING",
      to: "PENDING_BUSINESS_CONFIRMATION",
    });
  });

  it("HUMAN_REVIEW_UPDATED 不复制说明全文", () => {
    const event = buildHumanReviewUpdatedAudit({
      noteUpdated: true,
      actor: manualActor("王研判"),
    });
    expect(event.summary).toBe("人工研判说明已更新");
    expect(JSON.stringify(event.changes)).not.toContain("很长一段");
  });

  it("HANDOFF 截断 summary、metadata 存全文，拒绝超长", () => {
    const long = "甲".repeat(100);
    const event = buildHandoffAudit({
      note: long,
      actor: manualActor("王研判"),
    });
    expect(event.summary.endsWith("…")).toBe(true);
    expect(event.summary.length).toBeLessThanOrEqual(81);
    expect(event.metadata?.note).toBe(long);

    expect(() =>
      buildHandoffAudit({ note: "乙".repeat(HANDOFF_NOTE_MAX_LENGTH + 1), actor: manualActor("王研判")
}),
    ).toThrow(/不能超过/);
    expect(() => buildHandoffAudit({ note: "   ", actor: manualActor("王研判")
})).toThrow(/不能为空/);
  });

  it("asPlainText / truncateSummary", () => {
    expect(asPlainText("<b>已核实</b>")).toBe("已核实");
    expect(truncateSummary("短文本")).toBe("短文本");
  });
});
