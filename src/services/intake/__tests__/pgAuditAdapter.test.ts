import { describe, expect, it } from "vitest";
import { normalizePgAuditLine, parsePgAuditText, PgAuditParseError } from "@/services/intake/pgAuditAdapter";

describe("pgAudit 文本适配器", () => {
  const selectLine = "AUDIT: SESSION,2,1,READ,SELECT,TABLE,public.customers,select id,email from customers where id = 1,<not logged>";

  it("映射 SESSION READ 到 DATABASE_AUDIT 标准字段", () => {
    const result = normalizePgAuditLine(selectLine);
    expect(result.input.sourceType).toBe("DATABASE_AUDIT");
    expect(result.input.externalAlertId).toMatch(/^pgaudit:[0-9a-f]{8}$/);
    expect(result.input.alertSource).toBe("pgAudit");
    expect(result.input.operation).toBe("SELECT");
    expect(result.input.tableName).toBe("public.customers");
    expect(result.input.sql).toContain("select id,email");
    expect(result.unrecognized.some((item) => item.rawKey === "pgAudit.statementId")).toBe(true);
  });

  it("支持带逗号与双引号的 SQL 字段", () => {
    const line = 'AUDIT: SESSION,3,1,READ,SELECT,TABLE,public.customers,"select id, email from customers where note = ""vip""",<not logged>';
    const result = normalizePgAuditLine(line);
    expect(result.input.sql).toBe('select id, email from customers where note = "vip"');
  });

  it("批量解析公开样本格式并保持每行稳定 ID", () => {
    const text = [
      "AUDIT: SESSION,1,1,DDL,CREATE TABLE,TABLE,public.customers,create table customers (id int),<not logged>",
      selectLine,
    ].join("\n");
    const results = parsePgAuditText(text);
    expect(results).toHaveLength(2);
    expect(results[0].input.operation).toBe("CREATE TABLE");
    expect(results[0].input.externalAlertId).not.toBe(results[1].input.externalAlertId);
    expect(normalizePgAuditLine(selectLine).input.externalAlertId).toBe(results[1].input.externalAlertId);
  });

  it("拒绝非 pgAudit 或字段不完整的输入", () => {
    expect(() => normalizePgAuditLine("timestamp: 2026-08-28"))
      .toThrow(PgAuditParseError);
    expect(() => normalizePgAuditLine("AUDIT: SESSION,1,1,READ,SELECT"))
      .toThrow("字段数量无效");
    expect(() => normalizePgAuditLine("AUDIT: STATEMENT,1,1,READ,SELECT,TABLE,t,s,p"))
      .toThrow("仅支持 SESSION");
  });
});
