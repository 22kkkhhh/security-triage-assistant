import type { ObservationStatus } from "@/domain/types";
import { matchFieldByHeader, type FieldDef } from "./fields";
import {
  emptyNormalizedInput,
  type NormalizeResult,
  type RawImportData,
} from "./types";

const LIST_SPLITTER = /[,，、;；\s]+/;

/**
 * 数字解析：空串为 null；无法解析返回 undefined（交由调用方记入未识别），
 * 绝不把非法数字静默变成 0。
 */
export function parseNumberValue(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function parseBooleanValue(raw: string): boolean | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(是|成功|true|yes|y|1)$/i.test(trimmed)) return true;
  if (/^(否|失败|false|no|n|0)$/i.test(trimmed)) return false;
  return undefined;
}

export function parseStatusValue(
  raw: string,
): ObservationStatus | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(是|异常|存在|true|yes|abnormal)$/i.test(trimmed)) return "ABNORMAL";
  if (/^(否|无|不存在|false|no|normal|正常)$/i.test(trimmed)) return "NORMAL";
  if (/^(未知|不确定|unknown)$/i.test(trimmed)) return "UNKNOWN";
  return undefined;
}

function parseListValue(raw: string): string[] {
  return raw
    .split(LIST_SPLITTER)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * 将原始键值对标准化为 NormalizedSecurityInput。
 * - 表头/键通过集中维护的别名表精确匹配；
 * - 解析失败的值记入 unrecognized，字段保持 null；
 * - 缺失字段保持 null，不伪造默认值。
 */
export function normalizeRecord(data: RawImportData): NormalizeResult {
  const input = emptyNormalizedInput(data.sourceType);
  const matched: NormalizeResult["matched"] = [];
  const unrecognized: NormalizeResult["unrecognized"] = [];

  for (const { rawKey, rawValue } of data.pairs) {
    const field: FieldDef | null = matchFieldByHeader(rawKey);
    if (!field) {
      unrecognized.push({
        rawKey,
        rawValue,
        reason: "未识别的字段，未映射到任何标准字段",
      });
      continue;
    }

    const assign = (value: unknown) => {
      (input as unknown as Record<string, unknown>)[field.key] = value;
      matched.push({ fieldKey: field.key, rawKey, rawValue });
    };

    switch (field.type) {
      case "string": {
        const trimmed = rawValue.trim();
        assign(trimmed ? trimmed : null);
        break;
      }
      case "number": {
        const value = parseNumberValue(rawValue);
        if (value === undefined) {
          unrecognized.push({
            rawKey,
            rawValue,
            reason: `无法将“${rawValue}”解析为数字，字段 ${field.label} 保持为空`,
          });
        } else {
          assign(value);
        }
        break;
      }
      case "boolean": {
        const value = parseBooleanValue(rawValue);
        if (value === undefined) {
          unrecognized.push({
            rawKey,
            rawValue,
            reason: `无法将“${rawValue}”解析为“是/否”，字段 ${field.label} 保持为空`,
          });
        } else {
          assign(value);
        }
        break;
      }
      case "status": {
        const value = parseStatusValue(rawValue);
        if (value === undefined) {
          unrecognized.push({
            rawKey,
            rawValue,
            reason: `无法将“${rawValue}”解析为状态值，字段 ${field.label} 保持为空`,
          });
        } else {
          assign(value);
        }
        break;
      }
      case "list": {
        assign(parseListValue(rawValue));
        break;
      }
    }
  }

  return { input, matched, unrecognized };
}
