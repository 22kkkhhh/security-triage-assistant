/**
 * Web 展示层时间格式化。
 * 不修改 Domain 原始 timestamp；不改变 DOCX 报告生成逻辑。
 * 输出统一为 UTC+8 的 “YYYY-MM-DD HH:mm:ss”，不含 T / Z / 偏移 / 毫秒。
 */

const ISO_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g;

const pad = (n: number) => String(n).padStart(2, "0");

function toCnDisplay(date: Date): string {
  const cn = new Date(date.getTime() + 8 * 3600 * 1000);
  return `${cn.getUTCFullYear()}-${pad(cn.getUTCMonth() + 1)}-${pad(cn.getUTCDate())} ${pad(cn.getUTCHours())}:${pad(cn.getUTCMinutes())}:${pad(cn.getUTCSeconds())}`;
}

/** 单个时间值 → 面向用户的可读时间；null/空 → （无数据） */
export function formatDateTimeForDisplay(value: string | null | undefined): string {
  if (!value) return "（无数据）";
  if (value.includes("T") || /Z$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return toCnDisplay(date);
    }
  }
  // 已是人类可读（如 2026-08-08 02:36），原样保留；若仅到分钟可补秒
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    return `${value}:00`;
  }
  return value;
}

/** 将文案中的 ISO 时间戳替换为可读格式（展示层） */
export function formatDateTimesInDisplayText(text: string): string {
  return text.replace(ISO_PATTERN, (match) => formatDateTimeForDisplay(match));
}
