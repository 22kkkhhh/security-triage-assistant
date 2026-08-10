"use client";

import { finalConclusionLabels, riskLevelLabels } from "@/domain/labels";
import type {
  FinalConclusion,
  HumanReview,
  RiskLevel,
} from "@/domain/types";
import { Panel } from "./common";

/**
 * 人工最终研判：与系统建议严格分离。
 * reviewer / reviewedByUserId 为 Server-owned 责任人快照，始终只读。
 * canWriteSemantic / canWriteNote 来自 Server 派生 capability（UX）。
 */
export function HumanReviewPanel({
  humanReview,
  onChange,
  canWriteSemantic = true,
  canWriteNote = true,
  outstandingWorkHint = false,
}: {
  humanReview: HumanReview;
  onChange: (next: HumanReview) => void;
  canWriteSemantic?: boolean;
  canWriteNote?: boolean;
  /** 仍有待核查/待补事项时的轻量提示；不阻止提交 */
  outstandingWorkHint?: boolean;
}) {
  const update = (patch: Partial<HumanReview>) =>
    onChange({ ...humanReview, ...patch });

  const responsibilityLabel = humanReview.reviewer?.trim()
    ? humanReview.reviewer
    : "尚未形成最终研判责任人";
  const showLegacyHint =
    Boolean(humanReview.reviewer?.trim()) &&
    (humanReview.reviewedByUserId == null ||
      humanReview.reviewedByUserId === "");

  return (
    <Panel
      title="人工最终研判"
      extra={
        <span className="text-xs text-neutral-400">
          {canWriteSemantic || canWriteNote
            ? "系统建议不会自动修改本区域"
            : "只读查看"}
        </span>
      }
    >
      {outstandingWorkHint ? (
        <p
          className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
          data-testid="human-review-outstanding-hint"
        >
          当前仍有待核查事项，请结合现有证据完成人工研判。
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="block text-sm">
          <span className="text-neutral-500">当前研判责任人</span>
          <p className="mt-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800">
            {responsibilityLabel}
          </p>
          {showLegacyHint ? (
            <p className="mt-1 text-xs text-neutral-400">历史未认证记录</p>
          ) : null}
        </div>
        <label className="block text-sm">
          <span className="text-neutral-500">最终结论</span>
          {canWriteSemantic ? (
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
          ) : (
            <p className="mt-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800">
              {humanReview.finalConclusion
                ? finalConclusionLabels[humanReview.finalConclusion]
                : "（尚未确认）"}
            </p>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-neutral-500">人工风险等级</span>
          {canWriteSemantic ? (
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
          ) : (
            <p className="mt-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800">
              {humanReview.humanRiskLevel
                ? riskLevelLabels[humanReview.humanRiskLevel]
                : "（尚未评定）"}
            </p>
          )}
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="text-neutral-500">研判说明</span>
        {canWriteNote ? (
          <textarea
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            rows={3}
            value={humanReview.conclusionNote ?? ""}
            placeholder="请使用“疑似 / 存在风险 / 建议进一步核查”等措辞…"
            onChange={(e) =>
              update({ conclusionNote: e.target.value.trim() || null })
            }
          />
        ) : (
          <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800">
            {humanReview.conclusionNote ?? "（未填写）"}
          </p>
        )}
      </label>
    </Panel>
  );
}
