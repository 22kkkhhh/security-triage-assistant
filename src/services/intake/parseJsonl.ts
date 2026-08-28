import { JsonAlertParseError } from "./parseJsonAlert";

export const JSONL_MAX_LINES = 100;
export const JSONL_MAX_TOTAL_CHARS = 1_000_000;
export const JSONL_MAX_LINE_CHARS = 256_000;

export interface JsonlEntry {
  line: number;
  value: Record<string, unknown>;
}

export interface JsonlParseFailure {
  line: number;
  error: string;
}

export interface JsonlParseResult {
  entries: JsonlEntry[];
  failures: JsonlParseFailure[];
  totalLines: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse newline-delimited JSON without ever logging or echoing raw values. */
export function parseJsonlLines(
  rawText: string,
  limits: {
    maxLines?: number;
    maxTotalChars?: number;
    maxLineChars?: number;
  } = {},
): JsonlParseResult {
  const maxLines = limits.maxLines ?? JSONL_MAX_LINES;
  const maxTotalChars = limits.maxTotalChars ?? JSONL_MAX_TOTAL_CHARS;
  const maxLineChars = limits.maxLineChars ?? JSONL_MAX_LINE_CHARS;
  if (typeof rawText !== "string") {
    throw new JsonAlertParseError("JSONL 内容无效");
  }
  if (rawText.length > maxTotalChars) {
    throw new JsonAlertParseError(`JSONL 内容超过 ${maxTotalChars} 字符限制`);
  }

  const entries: JsonlEntry[] = [];
  const failures: JsonlParseFailure[] = [];
  const lines = rawText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const text = lines[index].trim();
    if (!text) continue;
    if (text.length > maxLineChars) {
      failures.push({ line: lineNumber, error: "单行内容超过大小限制" });
      continue;
    }
    if (entries.length + failures.length >= maxLines) {
      throw new JsonAlertParseError(`JSONL 最多支持 ${maxLines} 条记录`);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isRecord(parsed)) {
        throw new JsonAlertParseError("每行根节点必须是 JSON 对象");
      }
      entries.push({ line: lineNumber, value: parsed });
    } catch (error) {
      failures.push({
        line: lineNumber,
        error: error instanceof JsonAlertParseError ? error.message : "JSON 格式无效",
      });
    }
  }
  return { entries, failures, totalLines: lines.length };
}
