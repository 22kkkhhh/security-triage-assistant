"use client";

import { useState } from "react";
import {
  importSourceTypeLabels,
  type ImportSourceType,
  type NormalizedSecurityInput,
  type RawKeyValue,
  type UnrecognizedItem,
} from "@/services/normalization/types";
import { ConfirmationPanel } from "./ConfirmationPanel";
import { CsvImport } from "./CsvImport";
import { JsonAlertImport } from "./JsonAlertImport";
import { ManualEntryForm } from "./ManualEntryForm";
import { TextPasteForm } from "./TextPasteForm";

type InputMethod = "MANUAL" | "CSV" | "JSON" | "TEXT";

const methodOptions: { key: InputMethod; title: string; description: string }[] = [
  { key: "MANUAL", title: "手工录入", description: "通过结构化表单逐字段填写" },
  { key: "CSV", title: "CSV 导入", description: "上传安全平台导出的 CSV 文件并确认字段映射" },
  {
    key: "JSON",
    title: "JSON 导入",
    description: "上传单条安全告警 JSON 文件并确认字段映射",
  },
  { key: "TEXT", title: "文本粘贴", description: "粘贴“键:值”格式的告警文本" },
];

function sourceOptionsForMethod(
  method: InputMethod,
): Array<[string, string]> {
  return Object.entries(importSourceTypeLabels).filter(([key]) => {
    if (key === "MANUAL") return false;
    // WAZUH 仅作为 JSON adapter 可选；CSV/TEXT 不得暗示支持
    if (key === "WAZUH" && method !== "JSON") return false;
    return true;
  });
}

/**
 * 新建研判导入向导：
 * 选择输入方式 → 录入/上传/粘贴 → （CSV 含字段映射）→ 导入确认 → 进入研判。
 */
export function ImportFlow({
  onConfirmed,
  confirming = false,
}: {
  onConfirmed: (input: NormalizedSecurityInput) => void | Promise<void>;
  /** 创建案件进行中（由页面传入，用于禁用确认按钮） */
  confirming?: boolean;
}) {
  const [method, setMethod] = useState<InputMethod | null>(null);
  /** 非手工导入的 provenance 默认 OTHER；MANUAL 仍由 effectiveSourceType 覆盖 */
  const [sourceType, setSourceType] = useState<ImportSourceType>("OTHER");
  const [pending, setPending] = useState<{
    pairs: RawKeyValue[];
    unrecognized: UnrecognizedItem[];
  } | null>(null);

  const effectiveSourceType: ImportSourceType =
    method === "MANUAL" ? "MANUAL" : sourceType;

  const selectMethod = (next: InputMethod) => {
    setMethod(next);
    // 离开 JSON 时不得残留隐藏的 sourceType=WAZUH
    if (next !== "JSON" && sourceType === "WAZUH") {
      setSourceType("OTHER");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        请勿在 Demo 环境导入真实生产安全日志或客户敏感数据。
      </div>

      {pending === null && (
        <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">选择输入方式</h2>
          <div
            className="mt-3 flex flex-wrap gap-1 border-b border-neutral-200"
            role="tablist"
            aria-label="导入方式"
          >
            {methodOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={method === option.key}
                onClick={() => selectMethod(option.key)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${
                  method === option.key
                    ? "border-slate-800 font-medium text-slate-900"
                    : "border-transparent text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {option.title}
              </button>
            ))}
          </div>
          {method && (
            <p className="mt-3 text-xs text-neutral-500">
              {methodOptions.find((item) => item.key === method)?.description}
            </p>
          )}

          {method && method !== "MANUAL" && (
            <label className="mt-4 block max-w-xs text-sm">
              <span className="text-neutral-500">数据来源</span>
              <select
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as ImportSourceType)
                }
                data-testid="import-source-type"
              >
                {sourceOptionsForMethod(method).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {method === "JSON" && sourceType === "WAZUH" && (
            <p
              className="mt-3 text-xs text-neutral-600"
              data-testid="wazuh-import-hint"
            >
              将按 Wazuh JSON 字段结构进行确定性映射，未识别字段仍会保留供人工核查。
            </p>
          )}
        </section>
      )}

      {pending === null && method === "MANUAL" && (
        <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">手工录入</h2>
          <ManualEntryForm
            onSubmit={(pairs) => setPending({ pairs, unrecognized: [] })}
          />
        </section>
      )}

      {pending === null && method === "CSV" && (
        <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">CSV 导入</h2>
          <CsvImport
            onSubmit={(pairs) => setPending({ pairs, unrecognized: [] })}
          />
        </section>
      )}

      {pending === null && method === "JSON" && (
        <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">JSON 导入</h2>
          <JsonAlertImport
            sourceType={effectiveSourceType}
            onSubmit={(result) =>
              setPending({
                pairs: result.pairs,
                unrecognized: result.unrecognized,
              })
            }
          />
        </section>
      )}

      {pending === null && method === "TEXT" && (
        <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">文本粘贴</h2>
          <TextPasteForm
            sourceType={effectiveSourceType}
            onSubmit={(result) =>
              setPending({
                pairs: result.matched.map((item) => ({
                  rawKey: item.fieldKey,
                  rawValue: item.rawValue,
                })),
                unrecognized: result.unrecognized,
              })
            }
          />
        </section>
      )}

      {pending !== null && (
        <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">导入确认</h2>
          <ConfirmationPanel
            sourceType={effectiveSourceType}
            initialPairs={pending.pairs}
            unrecognized={pending.unrecognized}
            onConfirm={onConfirmed}
            onBack={() => setPending(null)}
            confirming={confirming}
          />
        </section>
      )}
    </div>
  );
}
