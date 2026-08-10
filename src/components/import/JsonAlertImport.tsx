"use client";

import { useRef, useState } from "react";
import type { ImportSourceType } from "@/services/normalization/types";
import {
  assertJsonAlertFileSize,
  JSON_ALERT_NO_FILE_MESSAGE,
  prepareJsonAlertImport,
  toJsonAlertImportErrorMessage,
  type JsonAlertPendingImport,
} from "./jsonImportModel";

/**
 * JSON 单文件上传：读取 → normalizeJsonAlert → 提交 pending import。
 * 不创建 Case；解析成功仅进入现有 ConfirmationPanel。
 */
export function JsonAlertImport({
  sourceType,
  onSubmit,
}: {
  sourceType: ImportSourceType;
  onSubmit: (pending: JsonAlertPendingImport) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) {
      setError(JSON_ALERT_NO_FILE_MESSAGE);
      return;
    }

    setBusy(true);
    try {
      assertJsonAlertFileSize(file.size);
      const text = await file.text();
      onSubmit(prepareJsonAlertImport(text, sourceType));
    } catch (err) {
      setError(toJsonAlertImportErrorMessage(err));
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        请勿在 Demo 环境导入真实生产安全日志或客户敏感数据。文件仅在本地浏览器中处理；
        解析成功后仍需在导入确认页人工确认，不会自动创建案件。
      </div>

      <label className="block text-sm">
        <span className="text-neutral-500">选择 JSON 文件（单条告警，不超过 1 MB）</span>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="mt-1 block text-sm"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            void handleFile(file);
          }}
        />
      </label>

      {error && (
        <p
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="json-alert-import-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
