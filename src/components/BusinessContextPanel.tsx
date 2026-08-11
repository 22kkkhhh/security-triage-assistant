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
import type { AutosaveState } from "@/hooks/autosaveState";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { Panel } from "./common";

/**
 * 业务合理性核查：可编辑时修改后由工作台重新运行规则分析。
 * canWriteStructured / canWriteSnapshot 来自 Server 派生 capability（UX）。
 * 仅展示既有 BusinessContext 字段；不推导合规 ContextRequirement。
 */

const selectClass =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900";
const readOnlyClass =
  "rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800";

/** 空字符串 / null 视为未填写（字段自身状态，非合规推导） */
export function isMissingText(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

/** UNKNOWN 表示尚未获取判断信息 */
export function isUnknownStatus(value: string): boolean {
  return value === "UNKNOWN";
}

export function businessContextFieldNeedsAttention(
  field: keyof BusinessContext,
  ctx: BusinessContext,
): boolean {
  switch (field) {
    case "changeTicketId":
    case "businessOwner":
    case "businessJustification":
      return isMissingText(ctx[field]);
    case "plannedTaskStatus":
    case "changeTicketStatus":
    case "ownerVerification":
    case "businessLegitimacy":
      return isUnknownStatus(ctx[field]);
    default:
      return false;
  }
}

function ExistenceSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: ExistenceStatus;
  onChange: (value: ExistenceStatus) => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span id={id} className={readOnlyClass}>
        {existenceStatusLabels[value]}
      </span>
    );
  }
  return (
    <select
      id={id}
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

function PendingBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
      待补充
    </span>
  );
}

function FieldBlock({
  label,
  helper,
  pending,
  controlId,
  children,
}: {
  label: string;
  helper?: string;
  pending?: boolean;
  /** 与控件 id 关联（label htmlFor） */
  controlId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {controlId ? (
          <label
            htmlFor={controlId}
            className="font-medium text-neutral-700"
          >
            {label}
          </label>
        ) : (
          <span className="font-medium text-neutral-700">{label}</span>
        )}
        <PendingBadge show={Boolean(pending)} />
      </div>
      {helper ? (
        <p className="text-xs leading-5 text-neutral-500">{helper}</p>
      ) : null}
      <div>{children}</div>
    </div>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-medium text-neutral-800">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function formatSavedAt(iso: string | null): string {
  if (!iso) return "—";
  return formatDateTimeForDisplay(iso);
}

export function businessContextSaveStatusLabel(
  state: AutosaveState | undefined,
): string | null {
  if (!state) return null;
  switch (state.status) {
    case "SAVING":
      return "保存中…";
    case "DIRTY":
      return "待保存…";
    case "SAVED":
      return `已保存 ${formatSavedAt(state.lastSavedAt).slice(11)}`;
    case "ERROR":
      return state.errorMessage?.trim()
        ? `保存失败：${state.errorMessage}`
        : "保存失败";
    default:
      return "已同步";
  }
}

export function BusinessContextPanel({
  businessContext,
  onChange,
  canWriteStructured = true,
  canWriteSnapshot = true,
  saveState,
  commandPending = false,
  onRetrySave,
}: {
  businessContext: BusinessContext;
  onChange: (next: BusinessContext) => void;
  canWriteStructured?: boolean;
  canWriteSnapshot?: boolean;
  /** Snapshot autosave 状态；语义命令成功后也会经 EXTERNAL_SAVED 变为已保存 */
  saveState?: AutosaveState;
  /** 语义命令飞行中（与 autosave 状态分离） */
  commandPending?: boolean;
  onRetrySave?: () => void;
}) {
  const update = (patch: Partial<BusinessContext>) =>
    onChange({ ...businessContext, ...patch });
  const readOnly = !canWriteStructured && !canWriteSnapshot;
  const saveLabel = commandPending
    ? "提交中…"
    : businessContextSaveStatusLabel(saveState);
  const showSave = Boolean(saveState) && !readOnly;

  return (
    <Panel
      title="业务合理性核查"
      extra={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {showSave && saveLabel ? (
            <span
              className={
                commandPending
                  ? "text-amber-700"
                  : saveState?.status === "ERROR"
                    ? "text-red-600"
                    : saveState?.status === "SAVING" ||
                        saveState?.status === "DIRTY"
                      ? "text-amber-700"
                      : "text-neutral-500"
              }
            >
              {saveLabel}
            </span>
          ) : (
            <span className="text-neutral-400">
              {readOnly
                ? "只读查看"
                : "结构化变更将写入案件并记入操作审计"}
            </span>
          )}
          {!commandPending &&
          showSave &&
          saveState?.status === "ERROR" &&
          onRetrySave ? (
            <button
              type="button"
              onClick={onRetrySave}
              className="rounded border border-red-200 px-1.5 py-0.5 text-red-700 hover:bg-red-50"
            >
              重试
            </button>
          ) : null}
        </div>
      }
    >
      <p className="mb-3 text-xs text-neutral-500">
        用于判断技术异常是否可能对应已授权业务。信息不足时保持「未知 / 未填写」。
      </p>

      <div className="space-y-3">
        <Group
          title="任务与变更"
          description="确认计划任务或变更工单。"
        >
          <FieldBlock
            label="计划任务状态"
            controlId="bc-planned-task-status"
            pending={businessContextFieldNeedsAttention(
              "plannedTaskStatus",
              businessContext,
            )}
          >
            <ExistenceSelect
              id="bc-planned-task-status"
              value={businessContext.plannedTaskStatus}
              disabled={!canWriteStructured}
              onChange={(plannedTaskStatus) => update({ plannedTaskStatus })}
            />
          </FieldBlock>

          <FieldBlock
            label="变更工单状态"
            controlId="bc-change-ticket-status"
            pending={businessContextFieldNeedsAttention(
              "changeTicketStatus",
              businessContext,
            )}
          >
            <ExistenceSelect
              id="bc-change-ticket-status"
              value={businessContext.changeTicketStatus}
              disabled={!canWriteStructured}
              onChange={(changeTicketStatus) => update({ changeTicketStatus })}
            />
          </FieldBlock>

          <FieldBlock
            label="工单编号"
            controlId="bc-change-ticket-id"
            pending={businessContextFieldNeedsAttention(
              "changeTicketId",
              businessContext,
            )}
          >
            {canWriteSnapshot ? (
              <input
                id="bc-change-ticket-id"
                className={`${selectClass} w-full max-w-xs`}
                value={businessContext.changeTicketId ?? ""}
                placeholder="例如 CHG-20260808-001"
                onChange={(e) =>
                  update({ changeTicketId: e.target.value.trim() || null })
                }
              />
            ) : (
              <span
                id="bc-change-ticket-id"
                className={`${readOnlyClass} inline-block min-w-48`}
              >
                {businessContext.changeTicketId ?? "（无数据）"}
              </span>
            )}
          </FieldBlock>
        </Group>

        <Group
          title="授权与负责人"
          description="确认业务负责人是否已知悉并确认。"
        >
          <FieldBlock
            label="业务负责人"
            controlId="bc-business-owner"
            pending={businessContextFieldNeedsAttention(
              "businessOwner",
              businessContext,
            )}
          >
            {canWriteSnapshot ? (
              <input
                id="bc-business-owner"
                className={`${selectClass} w-full max-w-xs`}
                value={businessContext.businessOwner ?? ""}
                placeholder="（未填写）"
                onChange={(e) =>
                  update({ businessOwner: e.target.value.trim() || null })
                }
              />
            ) : (
              <span
                id="bc-business-owner"
                className={`${readOnlyClass} inline-block min-w-48`}
              >
                {businessContext.businessOwner ?? "（无数据）"}
              </span>
            )}
          </FieldBlock>

          <FieldBlock
            label="负责人确认状态"
            controlId="bc-owner-verification"
            pending={businessContextFieldNeedsAttention(
              "ownerVerification",
              businessContext,
            )}
          >
            {canWriteStructured ? (
              <select
                id="bc-owner-verification"
                className={selectClass}
                value={businessContext.ownerVerification}
                onChange={(e) =>
                  update({
                    ownerVerification: e.target.value as VerificationStatus,
                  })
                }
              >
                {Object.entries(verificationStatusLabels).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            ) : (
              <span id="bc-owner-verification" className={readOnlyClass}>
                {verificationStatusLabels[businessContext.ownerVerification]}
              </span>
            )}
          </FieldBlock>
        </Group>

        <Group
          title="业务合理性"
          description="结论选项与事实说明分开填写；未知不等于正常。"
        >
          <FieldBlock
            label="业务合理性结论"
            controlId="bc-business-legitimacy"
            pending={businessContextFieldNeedsAttention(
              "businessLegitimacy",
              businessContext,
            )}
          >
            {canWriteStructured ? (
              <select
                id="bc-business-legitimacy"
                className={selectClass}
                value={businessContext.businessLegitimacy}
                onChange={(e) =>
                  update({
                    businessLegitimacy: e.target.value as BusinessLegitimacy,
                  })
                }
              >
                {Object.entries(businessLegitimacyLabels).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            ) : (
              <span id="bc-business-legitimacy" className={readOnlyClass}>
                {businessLegitimacyLabels[businessContext.businessLegitimacy]}
              </span>
            )}
          </FieldBlock>

          <div className="md:col-span-2">
            <FieldBlock
              label="业务合理性说明"
              controlId="bc-business-justification"
              pending={businessContextFieldNeedsAttention(
                "businessJustification",
                businessContext,
              )}
            >
              {canWriteSnapshot ? (
                <textarea
                  id="bc-business-justification"
                  className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
                  rows={3}
                  value={businessContext.businessJustification ?? ""}
                  placeholder="（补充事实依据，避免空泛判断）"
                  onChange={(e) =>
                    update({
                      businessJustification: e.target.value.trim() || null,
                    })
                  }
                />
              ) : (
                <p
                  id="bc-business-justification"
                  className="w-full whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm text-neutral-800"
                >
                  {businessContext.businessJustification ?? "（无数据）"}
                </p>
              )}
            </FieldBlock>
          </div>
        </Group>
      </div>
    </Panel>
  );
}
