import { describe, expect, it } from "vitest";
import { parseJsonlLines } from "../parseJsonl";

describe("parseJsonlLines", () => {
  it("parses valid objects and reports malformed lines without echoing data", () => {
    const result = parseJsonlLines('{"id":"1"}\nnot-json\n\n{"id":"2"}');
    expect(result.entries.map((entry) => entry.line)).toEqual([1, 4]);
    expect(result.failures).toEqual([{ line: 2, error: "JSON 格式无效" }]);
  });

  it("rejects arrays as records and enforces a line limit", () => {
    expect(parseJsonlLines("[]").failures[0]?.error).toBe("每行根节点必须是 JSON 对象");
    expect(() => parseJsonlLines('{"id":1}\n{"id":2}', { maxLines: 1 })).toThrow("最多支持 1 条记录");
  });
});
