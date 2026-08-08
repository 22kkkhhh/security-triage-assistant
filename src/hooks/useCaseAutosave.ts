"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveCaseStateAction } from "@/app/(app)/cases/actions";
import type { CaseStatus } from "@/domain/types";
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

/**
 * 案件自动保存：
 * - 文本类变更 debounce
 * - 明确操作可 immediate flush
 * - 以 saveSeq 忽略过期响应，避免状态倒退
 * - 失败不清除调用方本地业务状态
 * - Semantic Command 可通过 cancelPendingSave / commitExternalSave 协调
 * - STALE：调用方恢复服务端 canonical state（不得用客户端时间冒充版本）
 */
export function useCaseAutosave(options: {
  caseId: string;
  getPayload: () => unknown;
  debounceMs?: number;
  initialSavedAt?: string | null;
  /** STALE 时由调用方同步服务端状态 */
  onStale?: (payload: CaseStalePayload) => void;
}) {
  const { caseId, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [state, dispatch] = useReducer(autosaveReducer, {
    ...initialAutosaveState,
    status: options.initialSavedAt ? "SAVED" : "IDLE",
    lastSavedAt: options.initialSavedAt ?? null,
  });
  const getPayloadRef = useRef(options.getPayload);
  const onStaleRef = useRef(options.onStale);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    getPayloadRef.current = options.getPayload;
  }, [options.getPayload]);

  useEffect(() => {
    onStaleRef.current = options.onStale;
  }, [options.onStale]);

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
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const seq = ++seqRef.current;
    dispatch({ type: "EXTERNAL_SAVED", savedAt, seq });
  }, []);

  const runSave = useCallback(async (): Promise<boolean> => {
    clearTimer();
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

      const payload = getPayloadRef.current() as Record<string, unknown>;
      const baseUpdatedAt = stateRef.current.lastSavedAt;
      const result = await saveCaseStateAction(caseId, {
        ...payload,
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
        dispatch({ type: "SAVE_ERROR", seq, message: result.error });
        return false;
      }
      dispatch({
        type: "SAVE_SUCCESS",
        seq,
        savedAt: result.updatedAt,
      });
      return true;
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) {
        return false;
      }
      const message =
        error instanceof Error ? error.message : "保存失败，请重试";
      dispatch({ type: "SAVE_ERROR", seq, message });
      return false;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [caseId, cancelPendingSave]);

  const scheduleSave = useCallback(
    (mode: "debounce" | "immediate" = "debounce") => {
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

  return {
    saveState: state as AutosaveState,
    scheduleSave,
    flushSave,
    retrySave: runSave,
    cancelPendingSave,
    commitExternalSave,
  };
}
