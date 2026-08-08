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
 * 业务合理性核查：允许在前端 state 中修改业务上下文（Demo 用途），
 * 修改后由工作台重新运行规则分析并更新系统建议。
 */

const selectClass =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900";

function ExistenceSelect({
  value,
  onChange,
}: {
  value: ExistenceStatus;
  onChange: (value: ExistenceStatus) => void;
}) {
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
}: {
  businessContext: BusinessContext;
  onChange: (next: BusinessContext) => void;
}) {
  const update = (patch: Partial<BusinessContext>) =>
    onChange({ ...businessContext, ...patch });

  return (
    <Panel
      title="业务合理性核查（可编辑，修改后自动重新分析）"
      extra={
        <span className="text-xs text-neutral-400">演示用前端状态，不持久化</span>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Row label="计划任务状态">
          <ExistenceSelect
            value={businessContext.plannedTaskStatus}
            onChange={(plannedTaskStatus) => update({ plannedTaskStatus })}
          />
        </Row>
        <Row label="变更工单状态">
          <ExistenceSelect
            value={businessContext.changeTicketStatus}
            onChange={(changeTicketStatus) => update({ changeTicketStatus })}
          />
        </Row>
        <Row label="工单编号">
          <input
            className={`${selectClass} w-48`}
            value={businessContext.changeTicketId ?? ""}
            placeholder="（无数据）"
            onChange={(e) =>
              update({ changeTicketId: e.target.value.trim() || null })
            }
          />
        </Row>
        <Row label="业务负责人">
          <input
            className={`${selectClass} w-48`}
            value={businessContext.businessOwner ?? ""}
            placeholder="（无数据）"
            onChange={(e) =>
              update({ businessOwner: e.target.value.trim() || null })
            }
          />
        </Row>
        <Row label="负责人确认状态">
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
        </Row>
        <Row label="业务合理性">
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
        </Row>
      </div>
      <div className="mt-3">
        <Row label="业务合理性说明">
          <textarea
            className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
            rows={2}
            value={businessContext.businessJustification ?? ""}
            placeholder="（无数据）"
            onChange={(e) =>
              update({ businessJustification: e.target.value.trim() || null })
            }
          />
        </Row>
      </div>
    </Panel>
  );
}
