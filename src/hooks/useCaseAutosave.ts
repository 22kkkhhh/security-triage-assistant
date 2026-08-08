"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveCaseStateAction } from "@/app/(app)/cases/actions";
import {
  autosaveReducer,
  initialAutosaveState,
  type AutosaveState,
} from "./autosaveState";

const DEFAULT_DEBOUNCE_MS = 1800;

/**
 * 案件自动保存：
 * - 文本类变更 debounce
 * - 明确操作可 immediate flush
 * - 以 saveSeq 忽略过期响应，避免状态倒退
 * - 失败不清除调用方本地业务状态
 */
export function useCaseAutosave(options: {
  caseId: string;
  /** 每次保存时读取当前完整 canonical payload */
  getPayload: () => unknown;
  debounceMs?: number;
  /** 进入页面时已有的上次保存时间 */
  initialSavedAt?: string | null;
}) {
  const { caseId, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [state, dispatch] = useReducer(autosaveReducer, {
    ...initialAutosaveState,
    status: options.initialSavedAt ? "SAVED" : "IDLE",
    lastSavedAt: options.initialSavedAt ?? null,
  });
  const getPayloadRef = useRef(options.getPayload);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    getPayloadRef.current = options.getPayload;
  }, [options.getPayload]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const runSave = useCallback(async (): Promise<boolean> => {
    clearTimer();
    const seq = ++seqRef.current;
    dispatch({ type: "SAVE_START", seq });
    try {
      const result = await saveCaseStateAction(caseId, getPayloadRef.current());
      if (!result.ok) {
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
      const message =
        error instanceof Error ? error.message : "保存失败，请重试";
      dispatch({ type: "SAVE_ERROR", seq, message });
      return false;
    }
  }, [caseId]);

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

  useEffect(() => () => clearTimer(), []);

  return {
    saveState: state as AutosaveState,
    scheduleSave,
    flushSave,
    retrySave: runSave,
  };
}
