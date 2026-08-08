import { describe, expect, it } from "vitest";
import {
  displayCaseListRisk,
  displaySystems,
  displayUpdatedAt,
} from "@/components/cases/caseDisplay";

describe("历史案件展示工具", () => {
  it("风险优先显示人工风险，否则建议风险；都没有则暂无法评级", () => {
    expect(displayCaseListRisk("HIGH", "LOW")).toBe("高风险");
    expect(displayCaseListRisk(null, "MEDIUM")).toBe("中风险");
    expect(displayCaseListRisk(null, null)).toBe("暂无法评级");
  });

  it("UNKNOWN 场景下列表风险不会错误显示低风险（无可用等级时）", () => {
    expect(displayCaseListRisk(null, null)).not.toBe("低风险");
    expect(displayCaseListRisk(null, null)).toBe("暂无法评级");
  });

  it("systemsSearchText 用 / 展示", () => {
    expect(displaySystems("HR 系统|ERP 系统|CRM_PROD")).toBe(
      "HR 系统 / ERP 系统 / CRM_PROD",
    );
    expect(displaySystems(null)).toBe("—");
  });

  it("最近更新时间格式化为 YYYY-MM-DD HH:mm:ss（UTC+8）", () => {
    expect(displayUpdatedAt("2026-08-08T12:32:00.000Z")).toBe(
      "2026-08-08 20:32:00",
    );
  });
});
