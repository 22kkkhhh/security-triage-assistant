/**
 * v1.11 M2：运营 due-state / UTC+8 conversion（显式 now；不依赖机器时区）。
 */
import { describe, expect, it } from "vitest";
import {
  dueAtFormValueToIso,
  dueAtIsoToFormValue,
  formatOperationalDueLabel,
  resolveOperationalDueState,
  utc8CalendarDayKey,
} from "@/domain/caseDueDate";

/** 固定：2026-08-11 12:00:00 +08:00 = 2026-08-11T04:00:00.000Z */
const NOW = new Date("2026-08-11T04:00:00.000Z");

describe("UTC+8 datetime-local ↔ ISO", () => {
  it("form value 按 UTC+8 墙钟解释，不是 UTC", () => {
    const iso = dueAtFormValueToIso("2026-08-11T18:00");
    expect(iso).toBe("2026-08-11T10:00:00.000Z");
    expect(dueAtIsoToFormValue(iso)).toBe("2026-08-11T18:00");
  });

  it("非法 form 返回 null", () => {
    expect(dueAtFormValueToIso("not-a-date")).toBeNull();
    expect(dueAtFormValueToIso("2026-13-40T99:99")).toBeNull();
  });

  it("utc8CalendarDayKey 固定 +08:00", () => {
    // 2026-08-10 23:30 UTC → +08 = 2026-08-11 07:30
    expect(utc8CalendarDayKey(new Date("2026-08-10T23:30:00.000Z"))).toBe(
      "2026-08-11",
    );
    // 2026-08-11 15:59 UTC → +08 = 2026-08-11 23:59
    expect(utc8CalendarDayKey(new Date("2026-08-11T15:59:00.000Z"))).toBe(
      "2026-08-11",
    );
    // 2026-08-11 16:00 UTC → +08 = 2026-08-12 00:00
    expect(utc8CalendarDayKey(new Date("2026-08-11T16:00:00.000Z"))).toBe(
      "2026-08-12",
    );
  });
});

describe("resolveOperationalDueState", () => {
  it("no due → NONE", () => {
    expect(
      resolveOperationalDueState({
        dueAt: null,
        status: "INVESTIGATING",
        now: NOW,
      }),
    ).toBe("NONE");
  });

  it("overdue", () => {
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-11T03:59:59.000Z",
        status: "INVESTIGATING",
        now: NOW,
      }),
    ).toBe("OVERDUE");
  });

  it("exact now boundary → DUE_TODAY（dueAt >= now 且同日）", () => {
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-11T04:00:00.000Z",
        status: "NEW",
        now: NOW,
      }),
    ).toBe("DUE_TODAY");
  });

  it("due today later", () => {
    // 2026-08-11 18:00 +08 = 10:00Z
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-11T10:00:00.000Z",
        status: "INVESTIGATING",
        now: NOW,
      }),
    ).toBe("DUE_TODAY");
  });

  it("upcoming", () => {
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-14T10:00:00.000Z",
        status: "INVESTIGATING",
        now: NOW,
      }),
    ).toBe("UPCOMING");
  });

  it("CLOSED past-due → CLOSED not OVERDUE", () => {
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-01T00:00:00.000Z",
        status: "CLOSED",
        now: NOW,
      }),
    ).toBe("CLOSED");
  });

  it("midnight boundary UTC+8：刚过日界为 OVERDUE / 新日 UPCOMING", () => {
    // now = 2026-08-12 00:00 +08 = 2026-08-11T16:00:00.000Z
    const midnight = new Date("2026-08-11T16:00:00.000Z");
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-11T15:59:59.000Z", // 前一日 23:59:59 +08
        status: "INVESTIGATING",
        now: midnight,
      }),
    ).toBe("OVERDUE");
    expect(
      resolveOperationalDueState({
        dueAt: "2026-08-12T01:00:00.000Z", // 当日 09:00 +08
        status: "INVESTIGATING",
        now: midnight,
      }),
    ).toBe("DUE_TODAY");
  });
});

describe("formatOperationalDueLabel", () => {
  it("客观文案，不含紧急/SLA", () => {
    const overdue = formatOperationalDueLabel({
      dueAt: "2026-08-11T02:00:00.000Z",
      status: "INVESTIGATING",
      now: NOW,
    });
    expect(overdue).toContain("已逾期");
    expect(overdue).not.toMatch(/紧急|SLA|极高/);

    const none = formatOperationalDueLabel({
      dueAt: null,
      status: "NEW",
      now: NOW,
    });
    expect(none).toBe("未设置截止时间");
  });
});
