/**
 * Client-side import file size caps (v1.12-M2).
 * Browser reads files locally before normalization — keep symmetric soft limits.
 */

/** Shared default for JSON / CSV / text file imports (1 MiB). */
export const MAX_IMPORT_FILE_BYTES = 1_048_576;

/** Text paste character cap (aligned with file byte budget for UTF-8 ASCII). */
export const MAX_IMPORT_TEXT_CHARS = MAX_IMPORT_FILE_BYTES;

export function assertImportFileSize(
  byteLength: number,
  label: string = "导入文件",
): void {
  if (byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      `${label}过大（上限 ${MAX_IMPORT_FILE_BYTES} 字节）。请缩小后重试。`,
    );
  }
}

export function assertImportTextLength(text: string): void {
  if (text.length > MAX_IMPORT_TEXT_CHARS) {
    throw new Error(
      `粘贴文本过长（上限 ${MAX_IMPORT_TEXT_CHARS} 字符）。请缩小后重试。`,
    );
  }
}
