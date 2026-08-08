import Papa from "papaparse";
import { matchFieldByHeader } from "./fields";

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

/** 解析 CSV 文本（仅本地浏览器处理，不上传任何外部服务） */
export function parseCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  return {
    headers: parsed.meta.fields ?? [],
    rows: parsed.data,
    errors: parsed.errors.map((error) => error.message),
  };
}

export interface FieldMappingSuggestion {
  header: string;
  /** 自动匹配到的标准字段 key；未识别为 null（默认“不导入该字段”） */
  fieldKey: string | null;
}

/**
 * 根据别名表为 CSV 表头生成映射建议。
 * 只做精确匹配；无法识别的表头返回 null，由用户在映射页面人工选择。
 */
export function suggestFieldMapping(headers: string[]): FieldMappingSuggestion[] {
  return headers.map((header) => ({
    header,
    fieldKey: matchFieldByHeader(header)?.key ?? null,
  }));
}

/** 按用户确认后的映射，将一行 CSV 数据转换为原始键值对 */
export function applyFieldMapping(
  row: Record<string, string>,
  mapping: FieldMappingSuggestion[],
): { rawKey: string; rawValue: string }[] {
  const pairs: { rawKey: string; rawValue: string }[] = [];
  for (const { header, fieldKey } of mapping) {
    if (fieldKey === null) continue; // 用户选择“不导入该字段”
    const value = row[header];
    if (value === undefined || value.trim() === "") continue;
    pairs.push({ rawKey: fieldKey, rawValue: value });
  }
  return pairs;
}
