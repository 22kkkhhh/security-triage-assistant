"use client";

import { useState } from "react";
import { fieldDefs, type FieldGroup } from "@/services/normalization/fields";
import type { RawKeyValue } from "@/services/normalization/types";

const groupOrder: FieldGroup[] = ["基本告警", "身份", "数据", "历史基线", "网络"];

/**
 * 手工录入表单：按区域分组，非必填字段允许为空，
 * 空值在标准化时保持 null，不伪造默认值。
 */
export function ManualEntryForm({
  onSubmit,
}: {
  onSubmit: (pairs: RawKeyValue[]) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const pairs: RawKeyValue[] = fieldDefs
      .map((def) => ({
        rawKey: def.key,
        rawValue: (values[def.key] ?? "").trim(),
      }))
      .filter((pair) => pair.rawValue.length > 0);
    onSubmit(pairs);
  };

  return (
    <div className="space-y-4">
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
              .map((def) => (
                <label key={def.key} className="block text-sm">
                  <span className="text-neutral-500">{def.label}</span>
                  <input
                    className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                    value={values[def.key] ?? ""}
                    placeholder="（可不填）"
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [def.key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700"
          onClick={handleSubmit}
        >
          下一步：导入确认
        </button>
      </div>
    </div>
  );
}
