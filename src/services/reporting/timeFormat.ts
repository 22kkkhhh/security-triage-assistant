/**
 * 报告时间格式统一：正式报告中不出现 ISO 存储格式（T / Z / +08:00 / 毫秒）。
 * 统一输出 UTC+8 的 “YYYY-MM-DD HH:mm:ss”。
 */

const ISO_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g;

const pad = (n: number) => String(n).padStart(2, "0");

/** 将单个时间值格式化为 “YYYY-MM-DD HH:mm:ss”（UTC+8）；null 返回占位符 */
export function formatDateTime(value: string | null): string {
  if (!value) return "（无数据）";
  if (value.includes("T")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      // 转为 UTC+8 后取 UTC 分量
      const cn = new Date(date.getTime() + 8 * 3600 * 1000);
      return `${cn.getUTCFullYear()}-${pad(cn.getUTCMonth() + 1)}-${pad(cn.getUTCDate())} ${pad(cn.getUTCHours())}:${pad(cn.getUTCMinutes())}:${pad(cn.getUTCSeconds())}`;
    }
  }
  // 已是人类可读格式（如 2026-08-08 02:36），原样保留
  return value;
}

/** 将文本中所有 ISO 时间戳替换为人类易读格式 */
export function normalizeDateTimesInText(text: string): string {
  return text.replace(ISO_PATTERN, (match) => formatDateTime(match));
}
