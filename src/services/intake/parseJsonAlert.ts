import { normalizeRecord } from "@/services/normalization/normalize";
import type {
  ImportSourceType,
  NormalizeResult,
  RawKeyValue,
  UnrecognizedItem,
} from "@/services/normalization/types";

/** JSON 告警解析失败时的稳定错误类型（不含 stack）。 */
export class JsonAlertParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonAlertParseError";
  }
}

export interface ParseJsonAlertResult {
  pairs: RawKeyValue[];
  unrecognized: UnrecognizedItem[];
}

const MAX_NESTING_DEPTH = 10;
const MAX_FIELD_COUNT = 200;

const COMPLEX_ARRAY_REASON = "复杂数组暂不支持自动映射，需人工处理";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitiveArray(value: unknown[]): boolean {
  return value.every(
    (item) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
  );
}

function primitiveArrayToCsv(values: unknown[]): string {
  return values
    .filter((item) => item !== null && item !== undefined)
    .map(String)
    .join(",");
}

function consumeFieldBudget(counter: { count: number }): void {
  counter.count += 1;
  if (counter.count > MAX_FIELD_COUNT) {
    throw new JsonAlertParseError("JSON 字段数量过多，无法安全解析");
  }
}

function flattenJsonObject(
  value: Record<string, unknown>,
  prefix: string,
  depth: number,
  pairs: RawKeyValue[],
  unrecognized: UnrecognizedItem[],
  counter: { count: number },
): void {
  if (depth > MAX_NESTING_DEPTH) {
    throw new JsonAlertParseError("JSON 嵌套层级过深，无法安全解析");
  }

  for (const [key, rawValue] of Object.entries(value)) {
    consumeFieldBudget(counter);

    const path = prefix ? `${prefix}.${key}` : key;

    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    if (isPlainObject(rawValue)) {
      flattenJsonObject(rawValue, path, depth + 1, pairs, unrecognized, counter);
      continue;
    }

    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) {
        continue;
      }
      if (isPrimitiveArray(rawValue)) {
        const csv = primitiveArrayToCsv(rawValue);
        if (csv) {
          pairs.push({ rawKey: path, rawValue: csv });
        }
      } else {
        unrecognized.push({
          rawKey: path,
          rawValue: JSON.stringify(rawValue),
          reason: COMPLEX_ARRAY_REASON,
        });
      }
      continue;
    }

    pairs.push({ rawKey: path, rawValue: String(rawValue) });
  }
}

/**
 * 将单个 JSON object 文本解析为 RawKeyValue[]，供现有 normalizeRecord 使用。
 * 不支持 root array / JSONL / batch。
 */
export function parseJsonAlert(text: string): ParseJsonAlertResult {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new JsonAlertParseError("JSON 内容为空");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new JsonAlertParseError("JSON 格式无效，无法解析");
  }

  if (Array.isArray(parsed)) {
    throw new JsonAlertParseError("暂不支持 JSON 数组作为根节点，请提供单个 JSON 对象");
  }

  if (!isPlainObject(parsed)) {
    throw new JsonAlertParseError("JSON 根节点必须是对象");
  }

  const pairs: RawKeyValue[] = [];
  const unrecognized: UnrecognizedItem[] = [];
  flattenJsonObject(parsed, "", 1, pairs, unrecognized, { count: 0 });
  return { pairs, unrecognized };
}

/**
 * JSON text → flatten → normalizeRecord → NormalizedSecurityInput。
 * 不复制 fieldDefs / alias map。
 */
export function normalizeJsonAlert(
  text: string,
  sourceType: ImportSourceType,
): NormalizeResult {
  const { pairs, unrecognized: parserUnrecognized } = parseJsonAlert(text);
  const normalized = normalizeRecord({ sourceType, pairs });
  return {
    ...normalized,
    unrecognized: [...parserUnrecognized, ...normalized.unrecognized],
  };
}
