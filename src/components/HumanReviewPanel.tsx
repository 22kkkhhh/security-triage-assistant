"use client";

import { finalConclusionLabels, riskLevelLabels } from "@/domain/labels";
import type {
  FinalConclusion,
  HumanReview,
  RiskLevel,
} from "@/domain/types";
import { Panel } from "./common";

/**
 * 人工最终研判：与系统建议严格分离，系统建议不得自动覆盖本区域内容。
 */
export function HumanReviewPanel({
  humanReview,
  onChange,
}: {
  humanReview: HumanReview;
  onChange: (next: HumanReview) => void;
}) {
  const update = (patch: Partial<HumanReview>) =>
    onChange({ ...humanReview, ...patch });

  return (
    <Panel
      title="人工最终研判"
      extra={
        <span className="text-xs text-neutral-400">
          系统建议不会自动修改本区域
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className="text-neutral-500">研判人员</span>
          <input
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={humanReview.reviewer ?? ""}
            placeholder="（未填写）"
            onChange={(e) => update({ reviewer: e.target.value.trim() || null })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">最终结论</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={humanReview.finalConclusion ?? ""}
            onChange={(e) =>
              update({
                finalConclusion: (e.target.value ||
                  null) as FinalConclusion | null,
              })
            }
          >
            <option value="">（尚未确认）</option>
            {Object.entries(finalConclusionLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">人工风险等级</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            value={humanReview.humanRiskLevel ?? ""}
            onChange={(e) =>
              update({
                humanRiskLevel: (e.target.value || null) as RiskLevel | null,
              })
            }
          >
            <option value="">（尚未评定）</option>
            {Object.entries(riskLevelLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="text-neutral-500">研判说明</span>
        <textarea
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          rows={3}
          value={humanReview.conclusionNote ?? ""}
          placeholder="请使用“疑似 / 存在风险 / 建议进一步核查”等措辞…"
          onChange={(e) =>
            update({ conclusionNote: e.target.value.trim() || null })
          }
        />
      </label>
    </Panel>
  );
}
