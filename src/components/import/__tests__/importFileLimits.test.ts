import { describe, expect, it } from "vitest";
import {
  assertImportFileSize,
  assertImportTextLength,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_TEXT_CHARS,
} from "@/components/import/importFileLimits";
import { MAX_JSON_ALERT_FILE_BYTES } from "@/components/import/jsonImportModel";

describe("import file limits", () => {
  it("shares 1 MiB budget with JSON import constant", () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(1_048_576);
    expect(MAX_JSON_ALERT_FILE_BYTES).toBe(MAX_IMPORT_FILE_BYTES);
    expect(MAX_IMPORT_TEXT_CHARS).toBe(MAX_IMPORT_FILE_BYTES);
  });

  it("rejects oversized CSV/text inputs", () => {
    expect(() => assertImportFileSize(MAX_IMPORT_FILE_BYTES + 1, "CSV 文件")).toThrow(
      /CSV 文件过大/,
    );
    expect(() => assertImportTextLength("x".repeat(MAX_IMPORT_TEXT_CHARS + 1))).toThrow(
      /粘贴文本过长/,
    );
  });
});
