"use client";

import { useState } from "react";
import { assertImportFileSize } from "@/components/import/importFileLimits";
import {
  applyFieldMapping,
  parseCsv,
  suggestFieldMapping,
  type CsvParseResult,
  type FieldMappingSuggestion,
} from "@/services/normalization/csv";
import { fieldDefs } from "@/services/normalization/fields";
import type { RawKeyValue } from "@/services/normalization/types";

/**
 * CSV 导入：读取表头 → 自动别名匹配 → 用户确认/修改映射 →
 * 数据预览 → 以首行数据进入导入确认。
 * 本阶段每个研判案件基于单条记录，不做跨行/跨文件事件关联。
 */
export function CsvImport({
  onSubmit,
}: {
  onSubmit: (pairs: RawKeyValue[]) => void;
}) {
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<FieldMappingSuggestion[]>([]);

  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      assertImportFileSize(file.size, "CSV 文件");
      setFileError(null);
      const text = await file.text();
      const result = parseCsv(text);
      setParsed(result);
      setMapping(suggestFieldMapping(result.headers));
    } catch (error) {
      setParsed(null);
      setMapping([]);
      setFileError(
        error instanceof Error ? error.message : "CSV 文件读取失败，请重试。",
      );
    }
  };

  const updateMapping = (header: string, fieldKey: string | null) => {
    setMapping((prev) =>
      prev.map((item) => (item.header === header ? { ...item, fieldKey } : item)),
    );
  };

  const handleConfirm = () => {
    if (!parsed || parsed.rows.length === 0) return;
    onSubmit(applyFieldMapping(parsed.rows[0], mapping));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        请勿在 Demo 环境导入真实生产安全日志或客户敏感数据。文件仅在本地浏览器中处理。
      </div>
      <label className="block text-sm">
        <span className="text-neutral-500">选择 CSV 文件</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      {fileError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {fileError}
        </p>
      )}

      {parsed && (
        <>
          <div>
            <h3 className="text-sm font-medium text-neutral-900">
              字段映射（原始字段 → 系统标准字段）
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              无法识别的字段默认“不导入该字段”，请人工确认或修改映射。
            </p>
            <ul className="mt-2 space-y-1.5">
              {mapping.map((item) => (
                <li
                  key={item.header}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-40 shrink-0 font-mono text-xs text-neutral-600">
                    {item.header}
                  </span>
                  <span className="text-neutral-400">→</span>
                  <select
                    className={`rounded border px-2 py-1 text-sm ${
                      item.fieldKey === null
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-neutral-300 text-neutral-900"
                    }`}
                    value={item.fieldKey ?? ""}
                    onChange={(e) =>
                      updateMapping(item.header, e.target.value || null)
                    }
                  >
                    <option value="">不导入该字段</option>
                    {fieldDefs.map((def) => (
                      <option key={def.key} value={def.key}>
                        {def.label}（{def.key}）
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-neutral-900">
              数据预览（前 5 行）
            </h3>
            <div className="mt-2 overflow-x-auto rounded border border-neutral-200">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-50">
                  <tr>
                    {parsed.headers.map((header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap px-2 py-1 text-left font-medium text-neutral-600"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, index) => (
                    <tr key={index} className="border-t border-neutral-100">
                      {parsed.headers.map((header) => (
                        <td
                          key={header}
                          className="whitespace-nowrap px-2 py-1 text-neutral-700"
                        >
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              本阶段将基于首行数据创建单个研判案件，不做跨行自动关联。
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
              disabled={parsed.rows.length === 0}
              onClick={handleConfirm}
            >
              下一步：导入确认
            </button>
          </div>
        </>
      )}
    </div>
  );
}
