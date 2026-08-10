import type { saveCaseStateAction } from "@/app/(app)/cases/actions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import type { CaseStatus } from "@/domain/types";
import {
  mergeCaseSnapshotPatches,
  type CaseSnapshotPatch,
} from "@/services/persistence/caseSnapshotPatch";
import type { PersistedCaseState } from "@/services/persistence/types";
import { createAutosaveQueue, type AutosaveSaveOutcome } from "./autosaveQueue";
import type { AutosaveAction } from "./autosaveState";

export type CaseStalePayload = {
  updatedAt: string;
  lastActivityAt: string;
  status: CaseStatus;
  caseState: PersistedCaseState;
};

export type SnapshotPatchInput = Omit<CaseSnapshotPatch, "baseUpdatedAt">;

export type SaveCaseStateFn = (
  caseId: string,
  patch: CaseSnapshotPatch,
) => Promise<Awaited<ReturnType<typeof saveCaseStateAction>>>;

/** 语义命令准备结果：失败表示 Snapshot 未能落盘，调用方不得继续发送命令 */
export type SemanticCommandLease =
  | { ok: true; baseUpdatedAt: string | null }
  | { ok: false };

export type CaseAutosaveEngine = {
  scheduleSave: (mode: "debounce" | "immediate", patch: SnapshotPatchInput) => void;
  /** true 表示调用时刻已存在的全部编辑都已真实落盘 */
  flushSave: () => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  /** 仅用于 STALE canonical 恢复：明确丢弃本地 pending Snapshot */
  cancelPendingSave: () => void;
  /** savedAt 必须来自服务端 CaseRecord.updatedAt */
  commitExternalSave: (savedAt: string) => void;
  beginSemanticCommand: () => Promise<SemanticCommandLease>;
  endSemanticCommand: () => void;
  getPersistedUpdatedAt: () => string | null;
  hasPendingWork: () => boolean;
  dispose: () => void;
};

/**
 * 案件 Snapshot 自动保存核心（与 React 解耦，便于对竞态做行为测试）。
 *
 * - single-flight drain queue：请求在途期间的新编辑进入下一批，旧请求成功只确认自己 claim 的批次
 * - baseUpdatedAt 取自同步维护的 persistedUpdatedAt，连续保存不会用过期基线并发互相覆盖
 * - 语义命令：先 drain 已有编辑 → 挂起 Snapshot 保存 → 命令结束后基于新 baseline 继续
 * - STALE 是唯一允许丢弃本地 pending 的路径
 */
export function createCaseAutosaveEngine(options: {
  getCaseId: () => string;
  saveCase: SaveCaseStateFn;
  dispatch: (action: AutosaveAction) => void;
  debounceMs: number;
  initialSavedAt: string | null;
  notifyStale?: (payload: CaseStalePayload) => void;
  notifySaved?: (patch: SnapshotPatchInput) => void;
}): CaseAutosaveEngine {
  let seq = 0;
  /** STALE / dispose 后作废在途结果 */
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let persistedUpdatedAt: string | null = options.initialSavedAt;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const queue = createAutosaveQueue<SnapshotPatchInput>({
    merge: mergeCaseSnapshotPatches,
    onDirty: () => options.dispatch({ type: "MARK_DIRTY" }),
    onStart: () => {
      seq += 1;
      options.dispatch({ type: "SAVE_START", seq });
    },
    onSuccess: ({ claim, savedAt, patch }) => {
      options.dispatch({
        type: "SAVE_SUCCESS",
        seq,
        savedAt,
        claimedDirtySeq: claim,
      });
      options.notifySaved?.(patch);
    },
    onError: (message) => {
      options.dispatch({ type: "SAVE_ERROR", seq, message });
    },
    save: async (patch): Promise<AutosaveSaveOutcome> => {
      const startedGeneration = generation;
      try {
        const result = await options.saveCase(options.getCaseId(), {
          ...patch,
          baseUpdatedAt: persistedUpdatedAt,
        });
        if (startedGeneration !== generation) {
          return { status: "DISCARDED" };
        }
        if (!result.ok) {
          if (
            result.code === "STALE" &&
            result.updatedAt &&
            result.caseState &&
            result.status &&
            result.lastActivityAt
          ) {
            generation += 1;
            persistedUpdatedAt = result.updatedAt;
            options.notifyStale?.({
              updatedAt: result.updatedAt,
              lastActivityAt: result.lastActivityAt,
              status: result.status,
              caseState: result.caseState,
            });
            options.dispatch({ type: "CANCEL_PENDING" });
            seq += 1;
            options.dispatch({
              type: "EXTERNAL_SAVED",
              savedAt: result.updatedAt,
              seq,
            });
            return { status: "DISCARDED" };
          }
          return {
            status: "FAILED",
            message: actionErrorMessage(result, "保存失败，请重试"),
          };
        }
        persistedUpdatedAt = result.updatedAt;
        return { status: "SAVED", savedAt: result.updatedAt };
      } catch {
        if (startedGeneration !== generation) {
          return { status: "DISCARDED" };
        }
        // 未知异常：不展示 error.message / stack，只给稳定中文文案
        return { status: "FAILED", message: "保存暂未完成，请稍后重试。" };
      }
    },
  });

  return {
    scheduleSave: (mode, patch) => {
      queue.enqueue(patch);
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
    flushSave: () => {
      clearTimer();
      return queue.drain();
    },
    retrySave: () => {
      clearTimer();
      return queue.drain();
    },
    cancelPendingSave: () => {
      clearTimer();
      generation += 1;
      queue.discardPending();
      options.dispatch({ type: "CANCEL_PENDING" });
    },
    commitExternalSave: (savedAt) => {
      clearTimer();
      persistedUpdatedAt = savedAt;
      seq += 1;
      options.dispatch({ type: "EXTERNAL_SAVED", savedAt, seq });
      // 命令期间产生的新编辑保留，并基于新的 OCC baseline 继续保存
      if (queue.hasPendingWork()) {
        void queue.drain();
      }
    },
    beginSemanticCommand: async () => {
      clearTimer();
      const flushed = await queue.drain();
      if (!flushed) return { ok: false };
      queue.suspend();
      return { ok: true, baseUpdatedAt: persistedUpdatedAt };
    },
    endSemanticCommand: () => {
      queue.resume();
    },
    getPersistedUpdatedAt: () => persistedUpdatedAt,
    hasPendingWork: () => queue.hasPendingWork(),
    dispose: () => {
      clearTimer();
      generation += 1;
    },
  };
}
