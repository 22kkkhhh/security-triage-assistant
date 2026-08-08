"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveReportDraftAction } from "@/app/(app)/cases/reportActions";
import {
  autosaveReducer,
  initialAutosaveState,
  type AutosaveState,
} from "./autosaveState";
import type { ReportData } from "@/domain/types";

const DEFAULT_DEBOUNCE_MS = 1800;

/**
 * 报告草稿自动保存（与案件 autosave 状态机一致，保存目标为 reportDraft）。
 */
export function useReportAutosave(options: {
  caseId: string;
  getReport: () => ReportData;
  debounceMs?: number;
  initialSavedAt?: string | null;
}) {
  const { caseId, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [state, dispatch] = useReducer(autosaveReducer, {
    ...initialAutosaveState,
    status: options.initialSavedAt ? "SAVED" : "IDLE",
    lastSavedAt: options.initialSavedAt ?? null,
  });
  const getReportRef = useRef(options.getReport);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    getReportRef.current = options.getReport;
  }, [options.getReport]);

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
      const result = await saveReportDraftAction(caseId, getReportRef.current());
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
        error instanceof Error ? error.message : "报告保存失败，请重试";
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
