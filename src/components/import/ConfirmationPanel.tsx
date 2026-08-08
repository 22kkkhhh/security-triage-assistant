"use client";

import { useMemo, useState } from "react";
import { fieldDefs, type FieldGroup } from "@/services/normalization/fields";
import { normalizeRecord } from "@/services/normalization/normalize";
import type {
  ImportSourceType,
  NormalizedSecurityInput,
  RawKeyValue,
  UnrecognizedItem,
} from "@/services/normalization/types";

const groupOrder: FieldGroup[] = ["基本告警", "身份", "数据", "历史基线", "网络"];

/**
 * 导入确认页：所有输入方式统一在此经过人工确认。
 * 展示已识别字段 / 未识别内容 / 原始值 / 标准字段 / 解析结果，
 * 允许修改、清空、补充；只有点击“确认并开始研判”才会构造 SecurityCase。
 */
export function ConfirmationPanel({
  sourceType,
  initialPairs,
  unrecognized: initialUnrecognized,
  onConfirm,
  onBack,
  confirming = false,
}: {
  sourceType: ImportSourceType;
  initialPairs: RawKeyValue[];
  unrecognized: UnrecognizedItem[];
  onConfirm: (input: NormalizedSecurityInput) => void | Promise<void>;
  onBack: () => void;
  /** 创建案件进行中：禁用确认按钮，防止重复提交 */
  confirming?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const pair of initialPairs) {
      init[pair.rawKey] = pair.rawValue;
    }
    return init;
  });
  const [unrecognized, setUnrecognized] = useState(initialUnrecognized);

  // 实时预解析，展示解析结果与解析失败原因
  const preview = useMemo(() => {
    const pairs: RawKeyValue[] = Object.entries(values)
      .map(([rawKey, rawValue]) => ({ rawKey, rawValue: rawValue.trim() }))
      .filter((pair) => pair.rawValue.length > 0);
    return normalizeRecord({ sourceType, pairs });
  }, [values, sourceType]);

  const parseIssues = new Map(
    preview.unrecognized.map((item) => [item.rawKey, item.reason]),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        请确认以下解析结果。无法确定的内容保持为空，系统不会自动假设为正常；
        确认后才会创建研判案件。
      </div>

      {groupOrder.map((group) => (
        <fieldset
          key={group}
          className="rounded-md border border-neutral-200 px-4 py-3"
        >
          <legend className="px-1 text-sm font-medium text-neutral-700">
            {group}
          </legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fieldDefs
              .filter((def) => def.group === group)
              .map((def) => {
                const raw = values[def.key] ?? "";
                const parsedValue = preview.input[def.key];
                const issue = parseIssues.get(def.key);
                const recognized = raw.trim().length > 0;
                const parsedText = Array.isArray(parsedValue)
                  ? parsedValue.join("、")
                  : parsedValue === null
                    ? null
                    : String(parsedValue);
                return (
                  <label key={def.key} className="block text-sm">
                    <span className="text-neutral-500">
                      {def.label}
                      <span className="ml-1 font-mono text-xs text-neutral-400">
                        {def.key}
                      </span>
                    </span>
                    <input
                      className={`mt-1 w-full rounded border px-2 py-1 text-sm ${
                        issue
                          ? "border-amber-400 bg-amber-50"
                          : "border-neutral-300"
                      }`}
                      value={raw}
                      placeholder="（无数据，保持为空）"
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [def.key]: e.target.value,
                        }))
                      }
                    />
                    <span className="mt-0.5 block text-xs">
                      {issue ? (
                        <span className="text-amber-700">{issue}</span>
                      ) : recognized ? (
                        <span className="text-neutral-500">
                          解析结果：{parsedText ?? "（空）"}
                        </span>
                      ) : (
                        <span className="text-neutral-400">未识别 / 未填写</span>
                      )}
                    </span>
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}

      {unrecognized.length > 0 && (
        <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <h3 className="text-sm font-medium text-amber-800">
            未识别内容（{unrecognized.length} 条，需人工处理）
          </h3>
          <ul className="mt-2 space-y-1.5">
            {unrecognized.map((item, index) => (
              <li
                key={`${item.rawKey}-${index}`}
                className="flex items-start gap-2 text-xs text-amber-900"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-mono">{item.rawKey}</span>
                  {item.rawValue && (
                    <>
                      {"："}
                      <span className="font-mono">{item.rawValue}</span>
                    </>
                  )}
                  <span className="ml-2 text-amber-700">（{item.reason}）</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-0.5 text-amber-700 hover:bg-amber-100"
                  onClick={() =>
                    setUnrecognized((prev) =>
                      prev.filter((_, i) => i !== index),
                    )
                  }
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          className="rounded border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          onClick={onBack}
          disabled={confirming}
        >
          返回修改
        </button>
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
          disabled={confirming}
          onClick={() => void onConfirm(preview.input)}
        >
          {confirming ? "正在创建案件…" : "确认并开始研判"}
        </button>
      </div>
    </div>
  );
}
