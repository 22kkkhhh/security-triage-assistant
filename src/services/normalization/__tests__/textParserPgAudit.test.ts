import { describe, expect, it } from "vitest";
import { parsePastedText } from "@/services/normalization/textParser";

describe("文本导入中的 pgAudit 路由", () => {
  it("数据库审计来源将单条 pgAudit 日志送入专用适配器", () => {
    const result = parsePastedText(
      "AUDIT: SESSION,9,1,READ,SELECT,TABLE,public.customers,select id from customers,<not logged>",
      "DATABASE_AUDIT",
    );
    expect(result.input.sourceType).toBe("DATABASE_AUDIT");
    expect(result.input.operation).toBe("SELECT");
    expect(result.input.tableName).toBe("public.customers");
  });

  it("拒绝把多条 pgAudit 日志静默合并成一个案件", () => {
    expect(() => parsePastedText(
      [
        "AUDIT: SESSION,9,1,READ,SELECT,TABLE,public.customers,select id from customers,<not logged>",
        "AUDIT: SESSION,10,1,READ,SELECT,TABLE,public.customers,select email from customers,<not logged>",
      ].join("\n"),
      "DATABASE_AUDIT",
    )).toThrow("一次仅支持一条");
  });
});
