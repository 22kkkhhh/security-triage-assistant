import { describe, expect, it } from "vitest";
import type { SecurityCaseDraft } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import {
  applyFieldMapping,
  parseCsv,
  suggestFieldMapping,
} from "@/services/normalization/csv";
import { normalizeRecord } from "@/services/normalization/normalize";
import { parsePastedText } from "@/services/normalization/textParser";
import {
  buildDocxSpec,
  generateDocxBuffer,
} from "@/services/reporting/docxGenerator";
import { scanSensitive } from "@/services/reporting/masking";
import { buildReportData } from "@/services/reporting/reportBuilder";

/**
 * 端到端冒烟测试：
 * 导入（文本 / CSV / 手工）→ 标准化 → 人工确认 → 构造 SecurityCase →
 * 规则分析 → 核查清单 → 人工研判 → 报告 → 敏感信息检查 → DOCX。
 * 确保流程中不存在死路。
 */

const pasteText = [
  "告警名称：敏感数据异常访问",
  "告警时间：2026-08-08 02:36",
  "账号：demo_user_07",
  "源IP：172.16.8.23",
  "数据库：CRM_PROD",
  "数据表：customer_info",
  "访问量：182391",
  "敏感字段：姓名、手机号、身份证号、地址",
  "历史平均：14820",
  "失败次数：16",
  "访问系统：HR系统,ERP系统,CRM_PROD",
  "公网通信：是",
  "目的IP：203.0.113.42",
  "出站流量：1258291200",
].join("\n");

async function runFullFlow(draft: SecurityCaseDraft) {
  // 规则分析
  const analyzed = analyzeSecurityCase(draft);
  expect(analyzed.analysisResults.length).toBe(11);
  expect(analyzed.checklist.length).toBeGreaterThan(0);

  // 人工研判（模拟研判人员在工作台完成结论）
  const humanReview = {
    reviewer: "王研判（虚构研判人员）",
    finalConclusion: "SUSPECTED_SECURITY_INCIDENT" as const,
    humanRiskLevel: "HIGH" as const,
    conclusionNote: "当前证据显示疑似账号失陷，建议升级进一步核查。",
    adjustments: [],
    confirmedAt: new Date().toISOString(),
  };

  // 添加人工处置时间线
  const timeline = [
    ...analyzed.timeline,
    {
      id: "smoke-tl-1",
      occurredAt: "2026-08-08T10:00:00+08:00",
      eventType: "人工处置",
      title: "保全日志",
      description: "已申请保全认证与数据库审计日志。",
      operator: "王研判（虚构研判人员）",
      source: "HUMAN" as const,
    },
  ];

  // 生成报告初稿 → 人工编辑（模拟修改标题）
  const report = buildReportData({
    securityCase: analyzed,
    humanReview,
    checklist: analyzed.checklist,
    timeline,
  });
  report.title = "敏感数据异常访问事件（人工编辑）";

  // 敏感信息检查
  const findings = scanSensitive(
    report.sections.map((s) => s.content).join("\n"),
  );
  expect(findings).toEqual([]); // Demo 数据不应包含手机号/身份证/邮箱

  // 导出 DOCX
  const buffer = await generateDocxBuffer(report, {
    evidences: analyzed.evidences,
    timeline,
  });
  expect(buffer.length).toBeGreaterThan(0);

  const spec = buildDocxSpec(
    report,
    { evidences: analyzed.evidences, timeline },
    {},
  );
  return { analyzed, report, spec };
}

describe("端到端冒烟", () => {
  it("文本粘贴导入可走完完整流程并导出 DOCX", async () => {
    const { input, unrecognized } = parsePastedText(pasteText, "DATABASE_AUDIT");
    expect(unrecognized).toEqual([]);
    const draft = buildSecurityCaseDraft(input, "smoke-text");
    const { report, spec } = await runFullFlow(draft);
    // 人工结论进入报告，人工处置记录进入时间线表格
    expect(report.sections.find((s) => s.key === "conclusion")?.content).toMatch(
      /疑似安全事件/,
    );
    expect(JSON.stringify(spec.blocks)).toContain("已申请保全认证与数据库审计日志");
    expect(JSON.stringify(spec.blocks)).toContain(report.caseNumber);
  });

  it("CSV 导入可正常进入研判流程", async () => {
    const csvText = [
      "alert_name,alert_time,src_ip,db,rows",
      "敏感数据异常访问,2026-08-08 02:36,172.16.8.23,CRM_PROD,182391",
    ].join("\n");
    const { headers, rows, errors } = parseCsv(csvText);
    expect(errors).toEqual([]);
    const mapping = suggestFieldMapping(headers);
    const pairs = applyFieldMapping(rows[0], mapping);
    const { input } = normalizeRecord({ sourceType: "DATABASE_AUDIT", pairs });
    expect(input.alertName).toBe("敏感数据异常访问");
    const draft = buildSecurityCaseDraft(input, "smoke-csv");
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.analysisResults.length).toBe(11);
  });

  it("手工录入可正常进入研判流程", async () => {
    const { input } = normalizeRecord({
      sourceType: "MANUAL",
      pairs: [
        { rawKey: "alertName", rawValue: "手工录入告警" },
        { rawKey: "database", rawValue: "CRM_PROD" },
      ],
    });
    const draft = buildSecurityCaseDraft(input, "smoke-manual");
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.analysisResults.length).toBe(11);
    // 大量数据缺失时 UNKNOWN 占主导，建议等级为 null，不形成死路
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBeNull();
    const report = buildReportData({
      securityCase: analyzed,
      humanReview: null,
      checklist: analyzed.checklist,
      timeline: [],
    });
    expect(report.sections.find((s) => s.key === "conclusion")?.content).toMatch(
      /尚未形成人工研判结论/,
    );
  });
});
