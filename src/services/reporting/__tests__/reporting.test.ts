import { describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { displayRiskLevel } from "@/domain/labels";
import type { SecurityCase } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import { emptyNormalizedInput } from "@/services/normalization/types";
import {
  buildDocxSpec,
  generateDocxBuffer,
  suggestDocxFileName,
} from "@/services/reporting/docxGenerator";
import { maskSensitiveText, scanSensitive } from "@/services/reporting/masking";
import { buildReportData } from "@/services/reporting/reportBuilder";

function buildAnalyzed(draft: typeof caseA): SecurityCase {
  return analyzeSecurityCase(draft);
}

function reportFor(draft: typeof caseA) {
  const securityCase = buildAnalyzed(draft);
  return buildReportData({
    securityCase,
    humanReview: securityCase.humanReview,
    checklist: securityCase.checklist,
    timeline: securityCase.timeline,
  });
}

const reportA = reportFor(caseA);
const reportB = reportFor(caseB);
const analyzedB = buildAnalyzed(caseB);

const forbidden = /确认(遭到)?(黑客)?攻击|已被攻破|已失陷|已确认(数据)?泄露|已成功入侵/;

function allReportText(report: ReturnType<typeof buildReportData>): string {
  return [report.title, ...report.sections.map((s) => s.content)].join("\n");
}

describe("Report Builder", () => {
  it("ReportData 正确使用 HumanReview 最终结论", () => {
    const conclusionA = reportA.sections.find((s) => s.key === "conclusion");
    expect(conclusionA?.content).toMatch(/正常授权业务行为/);
    const conclusionB = reportB.sections.find((s) => s.key === "conclusion");
    expect(conclusionB?.content).toMatch(/疑似安全事件/);
  });

  it("SuggestedAssessment 不覆盖 HumanReview", () => {
    // 构造一个系统建议与人工结论冲突的场景：技术异常 HIGH，但人工结论为正常业务
    const securityCase = buildAnalyzed(caseA);
    expect(securityCase.analysisResults.some((r) => r.riskLevel === "HIGH")).toBe(
      true,
    );
    const conclusion = reportA.sections.find((s) => s.key === "conclusion");
    expect(conclusion?.content).toMatch(/正常授权业务行为/);
    // 系统建议只能以“初步分析”形式出现在概述中
    const overview = reportA.sections.find((s) => s.key === "overview");
    expect(overview?.content).toMatch(/系统初步分析/);
  });

  it("Case A 报告结论为正常授权业务，不因技术风险写成安全事件", () => {
    const text = allReportText(reportA);
    expect(text).toMatch(/CHG-20260808-003/);
    expect(text).not.toMatch(forbidden);
  });

  it("Case B 不出现确认攻击类措辞", () => {
    const text = allReportText(reportB);
    expect(text).toMatch(/疑似|存在风险|建议/);
    expect(text).not.toMatch(forbidden);
  });

  it("UNKNOWN 结果在报告中显示“暂无法评级”，不显示“低风险”", () => {
    const businessB = reportB.sections.find((s) => s.key === "businessReview");
    // Case B 业务负责人确认与业务合理性为 UNKNOWN
    expect(businessB?.content).toContain("（暂无法评级）");
    expect(businessB?.content).not.toMatch(/当前无法判断（低风险）/);
    // Case A 网络 UNKNOWN 同理
    const networkA = reportA.sections.find((s) => s.key === "networkAnalysis");
    expect(networkA?.content).toContain("（暂无法评级）");
    expect(networkA?.content).not.toMatch(/当前无法判断（低风险）/);
  });

  it("Case A 报告措辞正式：无生硬表达与重复标点", () => {
    const businessA = reportA.sections.find((s) => s.key === "businessReview");
    expect(businessA?.content).not.toContain("技术异常由业务上下文合法化");
    expect(businessA?.content).toMatch(
      /本次技术异常行为可由已授权业务活动合理解释/,
    );
    expect(allReportText(reportA)).not.toContain("。。");
    expect(allReportText(reportB)).not.toContain("。。");
  });

  it("Evidence 可以进入 ReportData，被排除的不进入最终报告", () => {
    expect(reportB.evidenceIds.length).toBeGreaterThan(0);
    const excludedId = reportB.evidenceIds[0];
    const trimmed = {
      ...reportB,
      evidenceIds: reportB.evidenceIds.filter((id) => id !== excludedId),
    };
    const spec = buildDocxSpec(trimmed, {
      evidences: analyzedB.evidences,
      timeline: analyzedB.timeline,
    });
    const tableTexts = JSON.stringify(spec.blocks);
    expect(tableTexts).not.toContain(excludedId);
    // 未排除时存在
    const fullSpec = buildDocxSpec(reportB, {
      evidences: analyzedB.evidences,
      timeline: analyzedB.timeline,
    });
    expect(JSON.stringify(fullSpec.blocks)).toContain(excludedId);
  });

  it("Timeline 正确进入 ReportData", () => {
    expect(reportB.timelineEventIds.length).toBe(analyzedB.timeline.length);
    const spec = buildDocxSpec(reportB, {
      evidences: analyzedB.evidences,
      timeline: analyzedB.timeline,
    });
    expect(JSON.stringify(spec.blocks)).toContain("连续失败认证");
  });

  it("null / UNKNOWN 不被生成为“正常”", () => {
    const draft = buildSecurityCaseDraft(
      emptyNormalizedInput("MANUAL"),
      "test-empty",
    );
    const securityCase = analyzeSecurityCase(draft);
    const report = buildReportData({
      securityCase,
      humanReview: null,
      checklist: securityCase.checklist,
      timeline: [],
    });
    const dataSection = report.sections.find((s) => s.key === "dataAnalysis");
    expect(dataSection?.content).toMatch(/数据不足|无法/);
    expect(dataSection?.content).not.toMatch(/未见大批量敏感数据访问/);
    const conclusion = report.sections.find((s) => s.key === "conclusion");
    expect(conclusion?.content).toMatch(/尚未形成人工研判结论/);
  });
});

describe("风险等级展示", () => {
  it("UNKNOWN 一律展示为“暂无法评级”，ABNORMAL / NORMAL 行为不变", () => {
    expect(displayRiskLevel("UNKNOWN", null)).toBe("暂无法评级");
    expect(displayRiskLevel("UNKNOWN", "LOW")).toBe("暂无法评级"); // 防御式
    expect(displayRiskLevel("UNKNOWN", "HIGH")).toBe("暂无法评级");
    expect(displayRiskLevel("ABNORMAL", "HIGH")).toBe("高风险");
    expect(displayRiskLevel("NORMAL", "LOW")).toBe("低风险");
  });
});

describe("敏感信息检查与脱敏", () => {
  it("敏感手机号可以脱敏", () => {
    const text = "联系人电话 13812345678 请知悉";
    expect(scanSensitive(text).some((f) => f.type === "PHONE")).toBe(true);
    const masked = maskSensitiveText(text);
    expect(masked).toContain("138****5678");
    expect(masked).not.toContain("13812345678");
  });

  it("身份证格式字符串可以脱敏", () => {
    const text = "证件号 110105199001011234";
    expect(scanSensitive(text).some((f) => f.type === "ID_CARD")).toBe(true);
    const masked = maskSensitiveText(text);
    expect(masked).toContain("110105********1234");
    expect(masked).not.toContain("110105199001011234");
  });

  it("Email 可以脱敏", () => {
    const masked = maskSensitiveText("邮箱 demo.user@example.com");
    expect(masked).toContain("d***@example.com");
  });
});

describe("DOCX 生成", () => {
  it("DOCX generator 可以成功生成非空文件", async () => {
    const buffer = await generateDocxBuffer(reportB, {
      evidences: analyzedB.evidences,
      timeline: analyzedB.timeline,
    });
    expect(buffer.length).toBeGreaterThan(0);
    // docx 本质为 zip（PK 头）
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("DOCX 中存在案件编号及主要章节标题", () => {
    const spec = buildDocxSpec(reportB, {
      evidences: analyzedB.evidences,
      timeline: analyzedB.timeline,
    });
    expect(spec.caseNumber).toMatch(/^INC-\d{8}-\d{3}$/);
    expect(suggestDocxFileName(reportB)).toContain(spec.caseNumber);
    const headings = spec.blocks
      .filter((b) => b.kind === "heading")
      .map((b) => b.text);
    for (const title of [
      "基本信息",
      "事件概述",
      "数据安全分析",
      "网络安全分析",
      "身份行为分析",
      "业务合理性核查",
      "人工研判结论",
      "整改建议",
    ]) {
      expect(headings.some((h) => h.includes(title))).toBe(true);
    }
  });

  it("正式报告主要字段不泄露 ISO 时间格式", () => {
    const spec = buildDocxSpec(reportB, {
      evidences: analyzedB.evidences,
      timeline: analyzedB.timeline,
    });
    const text = JSON.stringify(spec);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/\+08:00/);
    expect(text).not.toMatch(/\.\d{3}Z/);
    // 人类易读时间应存在
    expect(text).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it("ReportData 不输出 null / undefined", () => {
    for (const report of [reportA, reportB]) {
      expect(JSON.stringify(report)).not.toMatch(/:null|undefined/);
    }
  });

  it("结论章节分层展示最终结论与人工风险等级", () => {
    const conclusionA = reportA.sections.find((s) => s.key === "conclusion");
    expect(conclusionA?.content).toContain("最终结论：正常授权业务行为");
    expect(conclusionA?.content).toContain("人工风险等级：低风险");
    const conclusionB = reportB.sections.find((s) => s.key === "conclusion");
    expect(conclusionB?.content).toContain("最终结论：疑似安全事件");
    expect(conclusionB?.content).toContain("人工风险等级：高风险");
  });
});
