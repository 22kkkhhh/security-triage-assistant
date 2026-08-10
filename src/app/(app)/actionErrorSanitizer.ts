/**
 * Server Action → 浏览器的用户可见错误净化。
 *
 * 边界原则：
 * - 已知、可安全展示的产品状态文案（STALE / FORBIDDEN / NOT_FOUND / 校验失败）原样保留；
 * - 未知内部异常（Prisma、SQL、stack、文件路径、auth 库内部细节）一律替换为稳定中文文案；
 * - 不把所有错误吞成同一句：不同 Action 使用各自可操作的 fallback，code 仍然区分。
 *
 * 本模块只负责「返回给用户的字符串」，不改变任何 backend 语义或 error code。
 */

/** 通用兜底：语义未知但可重试 */
export const GENERIC_ACTION_ERROR_MESSAGE = "操作暂未完成，请稍后重试。";

/** 通用兜底：需要用户刷新后再试 */
export const GENERIC_REFRESH_ERROR_MESSAGE = "当前无法完成处理，请刷新后重试。";

/** 用户文案长度上限；超长通常是内部异常正文 */
const MAX_USER_FACING_LENGTH = 200;

/** 内部实现细节特征：命中即视为不可展示 */
const INTERNAL_DETAIL_PATTERNS: RegExp[] = [
  /prisma/i,
  /sqlite/i,
  /\bsql\b/i,
  /\bselect\b[\s\S]*\bfrom\b/i,
  /\bP\d{4}\b/,
  /invalid\s+`?\w+\.\w+/i,
  /unique constraint/i,
  /\bat\s+[\w$.<>[\]]+\s*\(/,
  /node_modules/i,
  /\b[a-z]:\\/i,
  /(?:^|[\s('"`])\/(?:home|users|var|usr|etc|opt|app|src)\//i,
  /\.[cm]?[jt]sx?\b/i,
  /\b(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/,
  /better-auth/i,
  /\bstack\b/i,
  /\berror:\s/i,
];

/**
 * 是否可以直接展示给用户。
 * 产品文案一律为简体中文；不含中文字符的字符串视为内部技术信息。
 */
export function isUserSafeMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_USER_FACING_LENGTH) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return false;
  return !INTERNAL_DETAIL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * 净化来自 domain / service 的错误文案：
 * 已知业务文案保留，未知内部细节替换为 fallback。
 */
export function sanitizeActionErrorMessage(
  message: unknown,
  fallback: string = GENERIC_ACTION_ERROR_MESSAGE,
): string {
  if (typeof message !== "string") return fallback;
  const trimmed = message.trim();
  return isUserSafeMessage(trimmed) ? trimmed : fallback;
}

/**
 * catch 到未知 exception 时使用：不读取 error.message / stack，
 * 只返回本 Action 约定的稳定中文文案。
 */
export function unknownActionErrorMessage(
  fallback: string = GENERIC_ACTION_ERROR_MESSAGE,
): string {
  return fallback;
}
