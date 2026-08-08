import { describe, expect, it } from "vitest";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import {
  applyFieldMapping,
  parseCsv,
  suggestFieldMapping,
} from "@/services/normalization/csv";
import { matchFieldByHeader } from "@/services/normalization/fields";
import { normalizeRecord, parseNumberValue } from "@/services/normalization/normalize";
import { parsePastedText } from "@/services/normalization/textParser";

describe("字段别名匹配", () => {
  it("src_ip 能映射到 sourceIp", () => {
    expect(matchFieldByHeader("src_ip")?.key).toBe("sourceIp");
    expect(matchFieldByHeader("source_ip")?.key).toBe("sourceIp");
    expect(matchFieldByHeader("client_ip")?.key).toBe("sourceIp");
    expect(matchFieldByHeader("remote_addr")?.key).toBe("sourceIp");
  });

  it("中文“源IP”可以映射", () => {
    expect(matchFieldByHeader("源IP")?.key).toBe("sourceIp");
    expect(matchFieldByHeader("来源IP")?.key).toBe("sourceIp");
    expect(matchFieldByHeader("账号")?.key).toBe("username");
    expect(matchFieldByHeader("数据库")?.key).toBe("database");
    expect(matchFieldByHeader("访问量")?.key).toBe("rowsAffected");
  });

  it("未知字段不会误映射", () => {
    expect(matchFieldByHeader("foo_bar")).toBeNull();
    expect(matchFieldByHeader("src")).toBeNull();
    expect(matchFieldByHeader("")).toBeNull();
  });
});

describe("标准化解析", () => {
  it("缺失字段保持 null", () => {
    const result = normalizeRecord({
      sourceType: "DATABASE_AUDIT",
      pairs: [{ rawKey: "数据库", rawValue: "CRM_PROD" }],
    });
    expect(result.input.database).toBe("CRM_PROD");
    expect(result.input.rowsAffected).toBeNull();
    expect(result.input.failedLoginAttempts).toBeNull();
    expect(result.input.externalCommunication).toBeNull();
  });

  it("CSV 数字字符串可以正确解析为 number", () => {
    expect(parseNumberValue("182391")).toBe(182391);
    const result = normalizeRecord({
      sourceType: "DATABASE_AUDIT",
      pairs: [{ rawKey: "rows", rawValue: "182391" }],
    });
    expect(result.input.rowsAffected).toBe(182391);
  });

  it("错误数字不会自动变为 0，而是保持 null 并记入未识别", () => {
    expect(parseNumberValue("abc")).toBeUndefined();
    const result = normalizeRecord({
      sourceType: "DATABASE_AUDIT",
      pairs: [{ rawKey: "访问量", rawValue: "abc" }],
    });
    expect(result.input.rowsAffected).toBeNull();
    expect(result.unrecognized.some((item) => item.rawKey === "访问量")).toBe(true);
  });
});

describe("文本粘贴解析", () => {
  it("key:value 可解析", () => {
    const result = parsePastedText("alertName: 敏感数据异常访问\nrows: 182391", "DATABASE_AUDIT");
    expect(result.input.alertName).toBe("敏感数据异常访问");
    expect(result.input.rowsAffected).toBe(182391);
  });

  it("中文全角冒号可解析", () => {
    const result = parsePastedText(
      "告警名称：敏感数据异常访问\n告警时间：2026-08-08 02:36\n账号：db_app_01\n源IP：10.20.16.87",
      "DATABASE_AUDIT",
    );
    expect(result.input.alertName).toBe("敏感数据异常访问");
    expect(result.input.alertTime).toBe("2026-08-08 02:36");
    expect(result.input.username).toBe("db_app_01");
    expect(result.input.sourceIp).toBe("10.20.16.87");
  });

  it("无法识别的文本行被保留为未识别内容", () => {
    const result = parsePastedText(
      "账号：db_app_01\n这是一段无法识别的说明文字\n未知字段：某个值",
      "MANUAL",
    );
    expect(result.unrecognized.some((item) => item.rawValue.includes("无法识别"))).toBe(true);
    expect(result.unrecognized.some((item) => item.rawKey === "未知字段")).toBe(true);
  });
});

describe("CSV 导入流程", () => {
  const csvText = [
    "src_ip,db,rows,unknown_col",
    "10.20.16.87,CRM_PROD,182391,zzz",
  ].join("\n");

  it("表头自动生成映射建议，未知列默认不导入", () => {
    const { headers } = parseCsv(csvText);
    const mapping = suggestFieldMapping(headers);
    expect(mapping.find((m) => m.header === "src_ip")?.fieldKey).toBe("sourceIp");
    expect(mapping.find((m) => m.header === "db")?.fieldKey).toBe("database");
    expect(mapping.find((m) => m.header === "unknown_col")?.fieldKey).toBeNull();
  });

  it("按确认映射转换行数据，用户可选择不导入某字段", () => {
    const { headers, rows } = parseCsv(csvText);
    const mapping = suggestFieldMapping(headers).map((item) =>
      item.header === "db" ? { ...item, fieldKey: null } : item,
    );
    const pairs = applyFieldMapping(rows[0], mapping);
    const result = normalizeRecord({ sourceType: "DATABASE_AUDIT", pairs });
    expect(result.input.sourceIp).toBe("10.20.16.87");
    expect(result.input.database).toBeNull();
    expect(result.input.rowsAffected).toBe(182391);
  });
});

describe("SecurityCase 构造与研判引擎衔接", () => {
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
    "目的端口：443",
    "出站流量：1258291200",
  ].join("\n");

  it("导入数据不会把 UNKNOWN 自动变 NORMAL", () => {
    const { input } = parsePastedText(pasteText, "DATABASE_AUDIT");
    const draft = buildSecurityCaseDraft(input, "test-import");
    // 导入未提供历史登录来源记录，陌生来源判断必须为 UNKNOWN
    expect(draft.identityContext.loginFromUnseenSource).toBe("UNKNOWN");
    // 业务信息未提供，必须为 UNKNOWN 而非“确认存在”
    expect(draft.businessContext.changeTicketStatus).toBe("UNKNOWN");
    expect(draft.businessContext.businessLegitimacy).toBe("UNKNOWN");
  });

  it("SecurityCase 构造后现有规则引擎仍能运行", () => {
    const { input } = parsePastedText(pasteText, "DATABASE_AUDIT");
    const draft = buildSecurityCaseDraft(input, "test-import-engine");
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.analysisResults.length).toBe(11);
    expect(analyzed.suggestedAssessment).not.toBeNull();
  });

  it("Case B 可以通过导入流程重建出等价研判场景", () => {
    const { input } = parsePastedText(pasteText, "AUTH");
    const draft = buildSecurityCaseDraft(input, "test-import-case-b");
    const analyzed = analyzeSecurityCase(draft);
    const abnormalRuleIds = analyzed.analysisResults
      .filter((r) => r.status === "ABNORMAL")
      .map((r) => r.ruleId);
    // 与 Case B 等量的核心异常规则仍然命中
    for (const ruleId of [
      "IDENTITY-002",
      "IDENTITY-003",
      "DATA-001",
      "DATA-002",
      "DATA-003",
      "NETWORK-001",
      "NETWORK-002",
    ]) {
      expect(abnormalRuleIds).toContain(ruleId);
    }
    // 业务合理性未确认，系统建议升级进一步调查，但不宣称确认攻击
    expect(analyzed.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
    expect(analyzed.suggestedAssessment?.summary).toMatch(
      /建议升级进一步安全调查/,
    );
  });
});
