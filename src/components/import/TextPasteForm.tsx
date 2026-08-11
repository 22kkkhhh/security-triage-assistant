"use client";

import { useState } from "react";
import { assertImportTextLength } from "@/components/import/importFileLimits";
import { parsePastedText } from "@/services/normalization/textParser";
import type { ImportSourceType, NormalizeResult } from "@/services/normalization/types";

/**
 * 文本粘贴导入：确定性解析 key:value / key：value 行，
 * 无法识别的行保留为“未识别内容”，不调用任何 AI。
 */
export function TextPasteForm({
  sourceType,
  onSubmit,
}: {
  sourceType: ImportSourceType;
  onSubmit: (result: NormalizeResult) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    try {
      assertImportTextLength(text);
      setError(null);
      onSubmit(parsePastedText(text, sourceType));
    } catch (err) {
      setError(err instanceof Error ? err.message : "文本处理失败，请重试。");
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-neutral-500">
          粘贴文本（支持“键:值”与“键：值”行，无法识别的行将保留待人工处理）
        </span>
        <textarea
          className="mt-1 h-48 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-sm"
          value={text}
          placeholder={"告警名称：敏感数据异常访问\n告警时间：2026-08-08 02:36\n账号：db_app_01"}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
          disabled={!text.trim()}
          onClick={handleSubmit}
        >
          下一步：导入确认
        </button>
      </div>
    </div>
  );
}
