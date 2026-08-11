/**
 * JSON 告警上传的纯 UI 适配层。
 * Generic JSON → normalizeJsonAlert；WAZUH → normalizeWazuhAlert。
 */

import {
  JsonAlertParseError,
  normalizeJsonAlert,
} from "@/services/intake/parseJsonAlert";
import { normalizeWazuhAlert } from "@/services/intake/wazuhAlertAdapter";
import type {
  ImportSourceType,
  RawKeyValue,
  UnrecognizedItem,
} from "@/services/normalization/types";
import { MAX_IMPORT_FILE_BYTES } from "@/components/import/importFileLimits";

/** 浏览器侧单文件上限：1 MiB（与 CSV/文本导入共享） */
export const MAX_JSON_ALERT_FILE_BYTES = MAX_IMPORT_FILE_BYTES;

export const JSON_ALERT_FILE_TOO_LARGE_MESSAGE =
  "JSON 文件过大，请上传不超过 1 MB 的单条告警文件。";

export const JSON_ALERT_NO_FILE_MESSAGE = "请先选择一个 JSON 文件。";

export const JSON_ALERT_GENERIC_FAILURE_MESSAGE =
  "JSON 文件读取或解析失败，请检查文件后重试。";

export type JsonAlertPendingImport = {
  pairs: RawKeyValue[];
  unrecognized: UnrecognizedItem[];
};

/**
 * 将 JSON 文本转为 ImportFlow pending 结构。
 * matched → ConfirmationPanel 已识别字段；unrecognized 保留 parser + normalize warnings。
 */
export function prepareJsonAlertImport(
  text: string,
  sourceType: ImportSourceType,
): JsonAlertPendingImport {
  const result =
    sourceType === "WAZUH"
      ? normalizeWazuhAlert(text)
      : normalizeJsonAlert(text, sourceType);
  return {
    pairs: result.matched.map((item) => ({
      rawKey: item.fieldKey,
      rawValue: item.rawValue,
    })),
    unrecognized: result.unrecognized,
  };
}

/** 文件过大时抛出带稳定文案的 Error（非 JsonAlertParseError）。 */
export function assertJsonAlertFileSize(byteLength: number): void {
  if (byteLength > MAX_JSON_ALERT_FILE_BYTES) {
    throw new Error(JSON_ALERT_FILE_TOO_LARGE_MESSAGE);
  }
}

/**
 * 将未知异常转为用户可读文案；JsonAlertParseError 保留其稳定 message。
 */
export function toJsonAlertImportErrorMessage(error: unknown): string {
  if (error instanceof JsonAlertParseError) {
    return error.message;
  }
  if (error instanceof Error) {
    if (
      error.message === JSON_ALERT_FILE_TOO_LARGE_MESSAGE ||
      error.message === JSON_ALERT_NO_FILE_MESSAGE
    ) {
      return error.message;
    }
  }
  return JSON_ALERT_GENERIC_FAILURE_MESSAGE;
}
