import { normalizeRecord } from "./normalize";
import type { ImportSourceType, NormalizeResult, RawKeyValue } from "./types";

/** 支持 key:value 与 key：value（中文全角冒号） */
const LINE_PATTERN = /^\s*([^:：\s][^:：]*?)\s*[:：]\s*(.*)$/;

/**
 * 确定性文本解析：逐行匹配“键:值”，
 * 无法识别的行原样保留为“未识别内容”，交由人工处理。
 * 不调用任何 AI / LLM / 外部 API。
 */
export function parsePastedText(
  text: string,
  sourceType: ImportSourceType,
): NormalizeResult {
  const pairs: RawKeyValue[] = [];
  const unparsedLines: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = LINE_PATTERN.exec(line);
    if (match) {
      pairs.push({ rawKey: match[1], rawValue: match[2] });
    } else {
      unparsedLines.push(line.trim());
    }
  }

  const result = normalizeRecord({ sourceType, pairs });

  for (const line of unparsedLines) {
    result.unrecognized.push({
      rawKey: "未识别内容",
      rawValue: line,
      reason: "行格式不符合“键:值”，未做任何猜测，请人工处理",
    });
  }

  return result;
}
