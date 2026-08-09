"use client";

import {
  businessLegitimacyLabels,
  existenceStatusLabels,
  verificationStatusLabels,
} from "@/domain/labels";
import type {
  BusinessContext,
  BusinessLegitimacy,
  ExistenceStatus,
  VerificationStatus,
} from "@/domain/types";
import { Panel } from "./common";

/**
 * 业务合理性核查：可编辑时修改后由工作台重新运行规则分析。
 * canWriteStructured / canWriteSnapshot 来自 Server 派生 capability（UX）。
 */

const selectClass =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900";
const readOnlyClass =
  "rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800";

function ExistenceSelect({
  value,
  onChange,
  disabled,
}: {
  value: ExistenceStatus;
  onChange: (value: ExistenceStatus) => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className={readOnlyClass}>{existenceStatusLabels[value]}</span>
    );
  }
  return (
    <select
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value as ExistenceStatus)}
    >
      {Object.entries(existenceStatusLabels).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 text-neutral-500">{label}</span>
      {children}
    </div>
  );
}

export function BusinessContextPanel({
  businessContext,
  onChange,
  canWriteStructured = true,
  canWriteSnapshot = true,
}: {
  businessContext: BusinessContext;
  onChange: (next: BusinessContext) => void;
  canWriteStructured?: boolean;
  canWriteSnapshot?: boolean;
}) {
  const update = (patch: Partial<BusinessContext>) =>
    onChange({ ...businessContext, ...patch });
  const readOnly = !canWriteStructured && !canWriteSnapshot;

  return (
    <Panel
      title={
        readOnly
          ? "业务合理性核查"
          : "业务合理性核查（可编辑，修改后自动重新分析）"
      }
      extra={
        <span className="text-xs text-neutral-400">
          {readOnly
            ? "只读查看"
            : "结构化变更将写入案件并记入操作审计"}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Row label="计划任务状态">
          <ExistenceSelect
            value={businessContext.plannedTaskStatus}
            disabled={!canWriteStructured}
            onChange={(plannedTaskStatus) => update({ plannedTaskStatus })}
          />
        </Row>
        <Row label="变更工单状态">
          <ExistenceSelect
            value={businessContext.changeTicketStatus}
            disabled={!canWriteStructured}
            onChange={(changeTicketStatus) => update({ changeTicketStatus })}
          />
        </Row>
        <Row label="工单编号">
          {canWriteSnapshot ? (
            <input
              className={`${selectClass} w-48`}
              value={businessContext.changeTicketId ?? ""}
              placeholder="（无数据）"
              onChange={(e) =>
                update({ changeTicketId: e.target.value.trim() || null })
              }
            />
          ) : (
            <span className={`${readOnlyClass} w-48`}>
              {businessContext.changeTicketId ?? "（无数据）"}
            </span>
          )}
        </Row>
        <Row label="业务负责人">
          {canWriteSnapshot ? (
            <input
              className={`${selectClass} w-48`}
              value={businessContext.businessOwner ?? ""}
              placeholder="（无数据）"
              onChange={(e) =>
                update({ businessOwner: e.target.value.trim() || null })
              }
            />
          ) : (
            <span className={`${readOnlyClass} w-48`}>
              {businessContext.businessOwner ?? "（无数据）"}
            </span>
          )}
        </Row>
        <Row label="负责人确认状态">
          {canWriteStructured ? (
            <select
              className={selectClass}
              value={businessContext.ownerVerification}
              onChange={(e) =>
                update({
                  ownerVerification: e.target.value as VerificationStatus,
                })
              }
            >
              {Object.entries(verificationStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <span className={readOnlyClass}>
              {verificationStatusLabels[businessContext.ownerVerification]}
            </span>
          )}
        </Row>
        <Row label="业务合理性">
          {canWriteStructured ? (
            <select
              className={selectClass}
              value={businessContext.businessLegitimacy}
              onChange={(e) =>
                update({
                  businessLegitimacy: e.target.value as BusinessLegitimacy,
                })
              }
            >
              {Object.entries(businessLegitimacyLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <span className={readOnlyClass}>
              {businessLegitimacyLabels[businessContext.businessLegitimacy]}
            </span>
          )}
        </Row>
      </div>
      <div className="mt-3">
        <Row label="业务合理性说明">
          {canWriteSnapshot ? (
            <textarea
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              rows={2}
              value={businessContext.businessJustification ?? ""}
              placeholder="（无数据）"
              onChange={(e) =>
                update({ businessJustification: e.target.value.trim() || null })
              }
            />
          ) : (
            <p className="w-full whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800">
              {businessContext.businessJustification ?? "（无数据）"}
            </p>
          )}
        </Row>
      </div>
    </Panel>
  );
}
