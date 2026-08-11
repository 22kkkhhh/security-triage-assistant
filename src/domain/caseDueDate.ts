/**
 * Case 运营截止时间（v1.11 M2）。
 *
 * dueAt = 运营截止时间，不是安全事件时间 / SLA / HumanReview deadline。
 * SoT：CaseRecord.dueAt（禁止写入 caseState）。
 * 时间展示与 calendar day 语义固定为 UTC+8。
 */

import type { CaseStatus } from "@/domain/types";

/** 队列排序 */
export type CaseQueueSort = "recent" | "due";

export const CASE_QUEUE_SORTS: readonly CaseQueueSort[] = [
  "recent",
  "due",
] as const;

/** 运营 due-state（presentation；显式传入 now） */
export type OperationalDueState =
  | "NONE"
  | "OVERDUE"
  | "DUE_TODAY"
  | "UPCOMING"
  | "CLOSED";

const CN_OFFSET_MS = 8 * 3600 * 1000;

export function isCaseQueueSort(value: string | undefined): value is CaseQueueSort {
  return value === "recent" || value === "due";
}

/** UTC+8 日历日键 YYYY-MM-DD */
export function utc8CalendarDayKey(instant: Date): string {
  const cn = new Date(instant.getTime() + CN_OFFSET_MS);
  const y = cn.getUTCFullYear();
  const m = String(cn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * datetime-local（按 UTC+8 墙钟理解）→ ISO instant。
 * 输入：YYYY-MM-DDTHH:mm 或 YYYY-MM-DDTHH:mm:ss
 */
export function dueAtFormValueToIso(formValue: string): string | null {
  const trimmed = formValue.trim();
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;
  const [, ys, ms, ds, hs, mins, ss] = match;
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mins);
  const s = Number(ss ?? "0");
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(h) ||
    !Number.isFinite(mi) ||
    !Number.isFinite(s)
  ) {
    return null;
  }
  // 将 UTC+8 墙钟解释为绝对时刻：Date.UTC(...) - 8h
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - CN_OFFSET_MS;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  // 回读校验，防止 JS Date 溢出滚日
  if (utc8CalendarDayKey(date) !== `${ys}-${ms}-${ds}`) return null;
  const cn = new Date(date.getTime() + CN_OFFSET_MS);
  if (
    cn.getUTCHours() !== h ||
    cn.getUTCMinutes() !== mi ||
    cn.getUTCSeconds() !== s
  ) {
    return null;
  }
  return date.toISOString();
}

/** ISO instant → datetime-local 值（UTC+8 墙钟，精确到分钟） */
export function dueAtIsoToFormValue(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const cn = new Date(date.getTime() + CN_OFFSET_MS);
  const y = cn.getUTCFullYear();
  const m = String(cn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cn.getUTCDate()).padStart(2, "0");
  const h = String(cn.getUTCHours()).padStart(2, "0");
  const mi = String(cn.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${mi}`;
}

/** 解析 Server 提交的 dueAt；null/"" → null；非法 → error string */
export function parseDueAtInput(raw: unknown): string | null | { error: string } {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return { error: "截止时间无效" };
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return { error: "截止时间无效" };
  return date.toISOString();
}

export function resolveOperationalDueState(input: {
  dueAt: string | null | undefined;
  status: CaseStatus;
  now: Date;
}): OperationalDueState {
  if (input.status === "CLOSED") return "CLOSED";
  if (!input.dueAt) return "NONE";
  const due = new Date(input.dueAt);
  if (Number.isNaN(due.getTime())) return "NONE";
  const now = input.now;
  if (due.getTime() < now.getTime()) return "OVERDUE";
  if (utc8CalendarDayKey(due) === utc8CalendarDayKey(now)) return "DUE_TODAY";
  return "UPCOMING";
}

/** UTC+8 墙钟到分钟（YYYY-MM-DD HH:mm） */
export function formatDueAtUtc8Minute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const cn = new Date(date.getTime() + CN_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${cn.getUTCFullYear()}-${pad(cn.getUTCMonth() + 1)}-${pad(cn.getUTCDate())} ${pad(cn.getUTCHours())}:${pad(cn.getUTCMinutes())}`;
}

/** Header 紧凑展示：今日 18:00 / 已逾期 · … / 截止 · … */
export function formatOperationalDueCompact(input: {
  dueAt: string | null | undefined;
  status: CaseStatus;
  now: Date;
}): string {
  const state = resolveOperationalDueState(input);
  if (state === "NONE" || !input.dueAt) return "未设置截止时间";
  const full = formatDueAtUtc8Minute(input.dueAt);
  const time = full.slice(11); // HH:mm
  switch (state) {
    case "OVERDUE":
      return `已逾期 · ${full}`;
    case "DUE_TODAY":
      return `今日 ${time}`;
    case "UPCOMING":
      return `截止 · ${full}`;
    case "CLOSED":
      return `已关闭 · 截止 ${full}`;
    default:
      return "未设置截止时间";
  }
}

/** 列表/队列客观文案（不含「紧急」「SLA」） */
export function formatOperationalDueLabel(input: {
  dueAt: string | null | undefined;
  status: CaseStatus;
  now: Date;
  formatDateTime?: (iso: string) => string;
}): string {
  const state = resolveOperationalDueState(input);
  if (state === "NONE") return "未设置截止时间";
  if (!input.dueAt) return "未设置截止时间";
  const short = input.formatDateTime
    ? input.formatDateTime(input.dueAt).replace(/:\d{2}$/, "")
    : formatDueAtUtc8Minute(input.dueAt);
  switch (state) {
    case "OVERDUE":
      return `已逾期 · ${short}`;
    case "DUE_TODAY":
      return `今日到期 · ${short}`;
    case "UPCOMING":
      return `截止 · ${short}`;
    case "CLOSED":
      return `已关闭 · 截止 ${short}`;
    default:
      return "未设置截止时间";
  }
}

/** sort=due 桶序（越小越靠前） */
export function dueSortBucket(
  state: OperationalDueState,
): number {
  switch (state) {
    case "OVERDUE":
      return 0;
    case "DUE_TODAY":
      return 1;
    case "UPCOMING":
      return 2;
    case "NONE":
      return 3;
    case "CLOSED":
      return 4;
    default:
      return 5;
  }
}
