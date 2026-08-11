import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  displayCaseListRisk,
  displaySystems,
  displayUpdatedAt,
  resolveCaseListRiskDisplay,
} from "@/components/cases/caseDisplay";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("历史案件展示工具", () => {
  it("风险优先显示人工风险，否则建议风险；都没有则暂无法评级", () => {
    expect(displayCaseListRisk("HIGH", "LOW")).toBe("高风险");
    expect(displayCaseListRisk(null, "MEDIUM")).toBe("中风险");
    expect(displayCaseListRisk(null, null)).toBe("暂无法评级");
  });

  it("Case List 风险带来源：人工 / 系统建议 / 暂无法评级", () => {
    expect(resolveCaseListRiskDisplay("HIGH", "LOW")).toEqual({
      source: "HUMAN",
      riskLabel: "高风险",
      text: "人工 · 高风险",
    });
    expect(resolveCaseListRiskDisplay(null, "HIGH")).toEqual({
      source: "SUGGESTED",
      riskLabel: "高风险",
      text: "系统建议 · 高风险",
    });
    expect(resolveCaseListRiskDisplay(null, null)).toEqual({
      source: "UNAVAILABLE",
      riskLabel: "暂无法评级",
      text: "暂无法评级",
    });
  });

  it("Case List desktop + mobile 均使用带来源的风险展示", () => {
    const page = readSrc("app/(app)/cases/page.tsx");
    expect(page).toContain("resolveCaseListRiskDisplay");
    expect(page).toContain("case-list-row");
    expect(page).toContain("case-list-mobile");
    expect(page).toContain("case-list-risk");
    expect(page).toContain("riskDisplay.text");
    expect(page).toContain("riskBadgeClass(riskDisplay.riskLabel)");
    expect(page).not.toContain("displayCaseListRisk(");
  });

  it("UNKNOWN 场景下列表风险不会错误显示低风险（无可用等级时）", () => {
    expect(displayCaseListRisk(null, null)).not.toBe("低风险");
    expect(displayCaseListRisk(null, null)).toBe("暂无法评级");
    expect(resolveCaseListRiskDisplay(null, null).text).toBe("暂无法评级");
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
