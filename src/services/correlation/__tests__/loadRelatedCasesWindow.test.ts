import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");

describe("loadRelatedCases 时间窗口契约", () => {
  it("loader 使用 30 天窗口与 scan/result cap，排除当前 id", () => {
    const src = readFileSync(
      path.join(root, "services/correlation/loadRelatedCases.ts"),
      "utf8",
    );
    expect(src).toContain("RELATED_CASES_WINDOW_DAYS");
    expect(src).toContain("RELATED_CASES_SCAN_CAP");
    expect(src).toContain("RELATED_CASES_RESULT_CAP");
    expect(src).toContain("id: { not: current.id }");
    expect(src).toContain("lastActivityAt: { gte: since }");
  });
});
