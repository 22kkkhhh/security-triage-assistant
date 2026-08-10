import type { saveReportDraftAction } from "@/app/(app)/cases/reportActions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import type { ReportData } from "@/domain/types";
import { createAutosaveQueue, type AutosaveSaveOutcome } from "./autosaveQueue";
import type { AutosaveAction } from "./autosaveState";

/** 报告 autosave 以「当前正文」为保存内容，批次本身不携带 payload */
type ReportEditBatch = null;

export type SaveReportDraftFn = (
  caseId: string,
  report: ReportData,
  options: {
    baseReportUpdatedAt: string | null;
    auditOperationId: string | null;
  },
) => Promise<Awaited<ReturnType<typeof saveReportDraftAction>>>;

export type ReportAutosaveEngine = {
  scheduleSave: (mode: "debounce" | "immediate") => void;
  /** true 表示调用时刻已存在的全部报告编辑都已真实持久化 */
  flushSave: () => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  isStaleLocked: () => boolean;
  hasPendingWork: () => boolean;
  dispose: () => void;
};

/**
 * 报告草稿自动保存核心（与 React 解耦，便于对竞态做行为测试）。
 *
 * - 本页生命周期内第一次真实 dirty 的成功保存 → REPORT_UPDATED（一次）
 * - single-flight drain queue：请求在途期间的新编辑不会被旧请求的成功抹成已保存
 * - flushSave 只有在调用时刻的全部编辑都落盘后才返回 true
 * - baseReportUpdatedAt 防并发覆盖；STALE_REPORT 锁定后停止 autosave
 */
export function createReportAutosaveEngine(options: {
  getCaseId: () => string;
  getReport: () => ReportData;
  saveReportDraft: SaveReportDraftFn;
  dispatch: (action: AutosaveAction) => void;
  debounceMs: number;
  initialSavedAt: string | null;
  createOperationId: () => string;
  notifyStale?: () => void;
}): ReportAutosaveEngine {
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reportUpdatedAt: string | null = options.initialSavedAt;
  let editOperationId: string | null = null;
  let auditRecorded = false;
  let staleLocked = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const queue = createAutosaveQueue<ReportEditBatch>({
    merge: () => null,
    onDirty: () => options.dispatch({ type: "MARK_DIRTY" }),
    onStart: () => {
      seq += 1;
      options.dispatch({ type: "SAVE_START", seq });
    },
    onSuccess: ({ claim, savedAt }) => {
      options.dispatch({
        type: "SAVE_SUCCESS",
        seq,
        savedAt,
        claimedDirtySeq: claim,
      });
    },
    onError: (message) => {
      options.dispatch({ type: "SAVE_ERROR", seq, message });
    },
    save: async (): Promise<AutosaveSaveOutcome> => {
      if (staleLocked) return { status: "DISCARDED" };
      try {
        const auditOperationId =
          !auditRecorded && editOperationId ? editOperationId : null;
        const result = await options.saveReportDraft(
          options.getCaseId(),
          options.getReport(),
          { baseReportUpdatedAt: reportUpdatedAt, auditOperationId },
        );
        if (!result.ok) {
          if (result.code === "STALE_REPORT") {
            staleLocked = true;
            options.notifyStale?.();
            options.dispatch({
              type: "SAVE_ERROR",
              seq,
              message: result.error,
            });
            return { status: "DISCARDED" };
          }
          return {
            status: "FAILED",
            message: actionErrorMessage(result, "报告保存失败，请重试"),
          };
        }
        if (result.audited) {
          auditRecorded = true;
        }
        reportUpdatedAt = result.reportUpdatedAt;
        return { status: "SAVED", savedAt: result.reportUpdatedAt };
      } catch {
        // 未知异常：不展示 error.message / stack，只给稳定中文文案
        return { status: "FAILED", message: "报告保存暂未完成，请稍后重试。" };
      }
    },
  });

  return {
    scheduleSave: (mode) => {
      if (staleLocked) return;
      if (!editOperationId) {
        editOperationId = options.createOperationId();
      }
      queue.enqueue(null);
      clearTimer();
      if (mode === "immediate") {
        void queue.drain();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void queue.drain();
      }, options.debounceMs);
    },
    flushSave: async () => {
      if (staleLocked) return false;
      clearTimer();
      return queue.drain();
    },
    retrySave: async () => {
      if (staleLocked) return false;
      clearTimer();
      return queue.drain();
    },
    isStaleLocked: () => staleLocked,
    hasPendingWork: () => queue.hasPendingWork(),
    dispose: clearTimer,
  };
}
