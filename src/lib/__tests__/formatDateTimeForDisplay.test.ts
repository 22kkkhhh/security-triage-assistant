import { describe, expect, it } from "vitest";
import {
  formatDateTimeForDisplay,
  formatDateTimesInDisplayText,
} from "@/lib/formatDateTimeForDisplay";

describe("Web 时间展示", () => {
  it("不输出 ISO 的 T / Z / 偏移", () => {
    const formatted = formatDateTimeForDisplay("2026-08-08T01:30:00+08:00");
    expect(formatted).toBe("2026-08-08 01:30:00");
    expect(formatted).not.toMatch(/T|Z|\+/);
  });

  it("UTC 时间按 UTC+8 显示", () => {
    expect(formatDateTimeForDisplay("2026-08-08T12:32:00.000Z")).toBe(
      "2026-08-08 20:32:00",
    );
  });

  it("已是可读时间则保留（分钟级补秒）", () => {
    expect(formatDateTimeForDisplay("2026-08-08 02:36")).toBe(
      "2026-08-08 02:36:00",
    );
  });

  it("文案中的 ISO 可被替换", () => {
    const text = formatDateTimesInDisplayText(
      "告警发生于 2026-08-08T01:30:00+08:00，请核查。",
    );
    expect(text).toContain("2026-08-08 01:30:00");
    expect(text).not.toContain("T");
  });
});
