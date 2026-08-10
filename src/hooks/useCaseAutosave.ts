"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveCaseStateAction } from "@/app/(app)/cases/actions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import type { CaseStatus } from "@/domain/types";
import {
  mergeCaseSnapshotPatches,
  type CaseSnapshotPatch,
} from "@/services/persistence/caseSnapshotPatch";
import type { PersistedCaseState } from "@/services/persistence/types";
import {
  autosaveReducer,
  initialAutosaveState,
  type AutosaveState,
} from "./autosaveState";

const DEFAULT_DEBOUNCE_MS = 1800;

export type CaseStalePayload = {
  updatedAt: string;
  lastActivityAt: string;
  status: CaseStatus;
  caseState: PersistedCaseState;
};

type SnapshotPatchInput = Omit<CaseSnapshotPatch, "baseUpdatedAt">;

/**
 * 案件 Snapshot 自动保存：
 * - 仅提交 CaseSnapshotPatch（allowlisted 非语义字段）
 * - 文本类变更 debounce；明确操作可 immediate flush
 * - 以 saveSeq 忽略过期响应，避免状态倒退
 * - 失败不清除调用方本地业务状态
 * - Semantic Command 可通过 cancelPendingSave / commitExternalSave 协调
 * - STALE：调用方恢复服务端 canonical state（不得用客户端时间冒充版本）
 */
export function useCaseAutosave(options: {
  caseId: string;
  debounceMs?: number;
  initialSavedAt?: string | null;
  /** STALE 时由调用方同步服务端状态 */
  onStale?: (payload: CaseStalePayload) => void;
  /**
   * Snapshot 成功持久化后回调（仅 ok 路径）。
   * 用于 Case context → compliance UI 的 server re-load（router.refresh），
   * 不得在 Client 侧重跑 compliance resolver。
   */
  onSaved?: (patch: SnapshotPatchInput) => void;
}) {
  const { caseId, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [state, dispatch] = useReducer(autosaveReducer, {
    ...initialAutosaveState,
    status: options.initialSavedAt ? "SAVED" : "IDLE",
    lastSavedAt: options.initialSavedAt ?? null,
  });
  const onStaleRef = useRef(options.onStale);
  const onSavedRef = useRef(options.onSaved);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const pendingPatchRef = useRef<SnapshotPatchInput | null>(null);

  useEffect(() => {
    onStaleRef.current = options.onStale;
  }, [options.onStale]);

  useEffect(() => {
    onSavedRef.current = options.onSaved;
  }, [options.onSaved]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelPendingSave = useCallback(() => {
    clearTimer();
    generationRef.current += 1;
    pendingPatchRef.current = null;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "CANCEL_PENDING" });
  }, []);

  /** savedAt 必须来自服务端 CaseRecord.updatedAt */
  const commitExternalSave = useCallback((savedAt: string) => {
    clearTimer();
    generationRef.current += 1;
    pendingPatchRef.current = null;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const seq = ++seqRef.current;
    dispatch({ type: "EXTERNAL_SAVED", savedAt, seq });
  }, []);

  const runSave = useCallback(async (): Promise<boolean> => {
    clearTimer();
    const patch = pendingPatchRef.current;
    if (!patch) {
      return true;
    }

    const generation = generationRef.current;
    const seq = ++seqRef.current;
    dispatch({ type: "SAVE_START", seq });

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (generation !== generationRef.current || controller.signal.aborted) {
        return false;
      }

      const baseUpdatedAt = stateRef.current.lastSavedAt;
      const result = await saveCaseStateAction(caseId, {
        ...patch,
        baseUpdatedAt,
      });

      if (controller.signal.aborted || generation !== generationRef.current) {
        return false;
      }

      if (!result.ok) {
        if (
          result.code === "STALE" &&
          result.updatedAt &&
          result.caseState &&
          result.status &&
          result.lastActivityAt
        ) {
          cancelPendingSave();
          onStaleRef.current?.({
            updatedAt: result.updatedAt,
            lastActivityAt: result.lastActivityAt,
            status: result.status,
            caseState: result.caseState,
          });
          const nextSeq = ++seqRef.current;
          dispatch({
            type: "EXTERNAL_SAVED",
            savedAt: result.updatedAt,
            seq: nextSeq,
          });
          return false;
        }
        dispatch({
          type: "SAVE_ERROR",
          seq,
          message: actionErrorMessage(result, "保存失败，请重试"),
        });
        return false;
      }
      pendingPatchRef.current = null;
      dispatch({
        type: "SAVE_SUCCESS",
        seq,
        savedAt: result.updatedAt,
      });
      onSavedRef.current?.(patch);
      return true;
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current) {
        return false;
      }
      // 未知异常：不展示 error.message / stack，只给稳定中文文案
      dispatch({
        type: "SAVE_ERROR",
        seq,
        message: "保存暂未完成，请稍后重试。",
      });
      return false;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [caseId, cancelPendingSave]);

  const scheduleSave = useCallback(
    (
      mode: "debounce" | "immediate" = "debounce",
      patch: SnapshotPatchInput,
    ) => {
      pendingPatchRef.current = pendingPatchRef.current
        ? mergeCaseSnapshotPatches(pendingPatchRef.current, patch)
        : patch;
      dispatch({ type: "MARK_DIRTY" });
      if (mode === "immediate") {
        void runSave();
        return;
      }
      clearTimer();
      timerRef.current = setTimeout(() => {
        void runSave();
      }, debounceMs);
    },
    [debounceMs, runSave],
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    clearTimer();
    const current = stateRef.current;
    if (current.status === "SAVED" || current.status === "IDLE") {
      return true;
    }
    return runSave();
  }, [runSave]);

  useEffect(() => () => {
    clearTimer();
    abortRef.current?.abort();
  }, []);

  /** 当前已持久化的 CaseRecord.updatedAt（供 Semantic Command 作 baseUpdatedAt） */
  const getPersistedUpdatedAt = useCallback((): string | null => {
    return stateRef.current.lastSavedAt;
  }, []);

  return {
    saveState: state as AutosaveState,
    scheduleSave,
    flushSave,
    retrySave: runSave,
    cancelPendingSave,
    commitExternalSave,
    getPersistedUpdatedAt,
  };
}
