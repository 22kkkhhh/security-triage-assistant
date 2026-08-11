"use client";

import { useState } from "react";
import { actionClass } from "@/components/layout/pageChrome";
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

const methodOptions: { key: InputMethod; title: string; description: string }[] =
  [
    {
      key: "MANUAL",
      title: "手工录入",
      description: "通过结构化表单逐字段填写",
    },
    {
      key: "CSV",
      title: "CSV 导入",
      description: "上传安全平台导出的 CSV 文件并确认字段映射",
    },
    {
      key: "JSON",
      title: "JSON 导入",
      description: "上传单条安全告警 JSON 文件并确认字段映射",
    },
    {
      key: "TEXT",
      title: "文本粘贴",
      description: "粘贴“键:值”格式的告警文本",
    },
  ];

const stepLabels = ["选择来源", "提供告警", "确认并创建"] as const;

function sourceOptionsForMethod(
  method: InputMethod,
): Array<[string, string]> {
  return Object.entries(importSourceTypeLabels).filter(([key]) => {
    if (key === "MANUAL") return false;
    if (key === "WAZUH" && method !== "JSON") return false;
    return true;
  });
}

function IntakeStepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      data-testid="intake-step-indicator"
      aria-label="新建研判步骤"
    >
      {stepLabels.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const active = step === current;
        const done = step < current;
        return (
          <li
            key={label}
            className={
              active
                ? "font-semibold text-neutral-900"
                : done
                  ? "text-neutral-600"
                  : "text-neutral-400"
            }
            aria-current={active ? "step" : undefined}
          >
            <span className="tabular-nums">{step}</span> {label}
            {index < stepLabels.length - 1 ? (
              <span className="ml-3 text-neutral-300" aria-hidden>
                /
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 新建研判导入向导：
 * 选择输入方式 → 录入/上传/粘贴 → （CSV 含字段映射）→ 导入确认 → 进入研判。
 * 步骤指示仅为 presentation，不改变状态机。
 */
export function ImportFlow({
  onConfirmed,
  confirming = false,
}: {
  onConfirmed: (input: NormalizedSecurityInput) => void | Promise<void>;
  confirming?: boolean;
}) {
  const [method, setMethod] = useState<InputMethod | null>(null);
  const [sourceType, setSourceType] = useState<ImportSourceType>("OTHER");
  const [pending, setPending] = useState<{
    pairs: RawKeyValue[];
    unrecognized: UnrecognizedItem[];
  } | null>(null);

  const effectiveSourceType: ImportSourceType =
    method === "MANUAL" ? "MANUAL" : sourceType;

  const selectMethod = (next: InputMethod) => {
    setMethod(next);
    if (next !== "JSON" && sourceType === "WAZUH") {
      setSourceType("OTHER");
    }
  };

  const step: 1 | 2 | 3 = pending !== null ? 3 : method ? 2 : 1;

  return (
    <div className="space-y-4" data-testid="import-flow">
      <div
        className="border-l-2 border-amber-400 bg-amber-50/60 px-3 py-2 text-xs leading-5 text-amber-900"
        role="note"
      >
        请勿在 Demo 环境导入真实生产安全日志或客户敏感数据。
      </div>

      <IntakeStepIndicator current={step} />

      {pending === null ? (
        <div className="border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              1 选择来源
            </h2>
            <div
              className="mt-3 flex flex-wrap gap-1"
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
                  className={`rounded px-3 py-1.5 text-sm ${
                    method === option.key
                      ? "bg-slate-800 text-white"
                      : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {option.title}
                </button>
              ))}
            </div>
            {method ? (
              <p className="mt-2 text-xs text-neutral-500">
                {methodOptions.find((item) => item.key === method)?.description}
              </p>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">
                请选择一种告警导入方式以继续。
              </p>
            )}

            {method && method !== "MANUAL" ? (
              <label className="mt-3 block max-w-xs text-sm">
                <span className="text-xs font-medium text-neutral-600">
                  数据来源
                </span>
                <select
                  className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
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
            ) : null}

            {method === "JSON" && sourceType === "WAZUH" ? (
              <p
                className="mt-2 text-xs text-neutral-600"
                data-testid="wazuh-import-hint"
              >
                将按 Wazuh JSON 字段结构进行确定性映射，未识别字段仍会保留供人工核查。
              </p>
            ) : null}
          </div>

          {method ? (
            <div className="px-4 py-3">
              <h2 className="mb-3 text-sm font-semibold text-neutral-900">
                2 提供告警
              </h2>
              {method === "MANUAL" ? (
                <ManualEntryForm
                  onSubmit={(pairs) => setPending({ pairs, unrecognized: [] })}
                />
              ) : null}
              {method === "CSV" ? (
                <CsvImport
                  onSubmit={(pairs) => setPending({ pairs, unrecognized: [] })}
                />
              ) : null}
              {method === "JSON" ? (
                <JsonAlertImport
                  sourceType={effectiveSourceType}
                  onSubmit={(result) =>
                    setPending({
                      pairs: result.pairs,
                      unrecognized: result.unrecognized,
                    })
                  }
                />
              ) : null}
              {method === "TEXT" ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="border border-neutral-200 bg-white px-4 py-4">
          <h2 className="text-base font-semibold text-neutral-900">
            确认导入内容
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            请确认标准化结果后创建案件
          </p>
          <div className="mt-4">
            <ConfirmationPanel
              sourceType={effectiveSourceType}
              initialPairs={pending.pairs}
              unrecognized={pending.unrecognized}
              onConfirm={onConfirmed}
              onBack={() => setPending(null)}
              confirming={confirming}
              confirmLabel="创建研判案件"
              confirmClassName={actionClass.primary}
              backClassName={actionClass.secondary}
            />
          </div>
        </div>
      )}
    </div>
  );
}
