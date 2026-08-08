"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveReportDraftAction } from "@/app/(app)/cases/reportActions";
import type { ReportData } from "@/domain/types";
import {
  autosaveReducer,
  initialAutosaveState,
  type AutosaveState,
} from "./autosaveState";

const DEFAULT_DEBOUNCE_MS = 1800;

/**
 * 报告草稿自动保存：
 * - 本页生命周期内第一次真实 dirty 的成功保存 → REPORT_UPDATED（一次）
 * - 后续 autosave 只更新 reportDraft / reportUpdatedAt，不刷 Audit / lastActivityAt
 * - 使用 baseReportUpdatedAt 防并发覆盖
 */
export function useReportAutosave(options: {
  caseId: string;
  getReport: () => ReportData;
  debounceMs?: number;
  initialSavedAt?: string | null;
  onStale?: () => void;
}) {
  const { caseId, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [state, dispatch] = useReducer(autosaveReducer, {
    ...initialAutosaveState,
    status: options.initialSavedAt ? "SAVED" : "IDLE",
    lastSavedAt: options.initialSavedAt ?? null,
  });
  const getReportRef = useRef(options.getReport);
  const onStaleRef = useRef(options.onStale);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const editOperationIdRef = useRef<string | null>(null);
  const auditRecordedRef = useRef(false);
  const staleLockedRef = useRef(false);

  useEffect(() => {
    getReportRef.current = options.getReport;
  }, [options.getReport]);

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

  const runSave = useCallback(async (): Promise<boolean> => {
    if (staleLockedRef.current) return false;
    clearTimer();
    const seq = ++seqRef.current;
    dispatch({ type: "SAVE_START", seq });
    try {
      const auditOperationId =
        !auditRecordedRef.current && editOperationIdRef.current
          ? editOperationIdRef.current
          : null;
      const result = await saveReportDraftAction(
        caseId,
        getReportRef.current(),
        {
          baseReportUpdatedAt: stateRef.current.lastSavedAt,
          auditOperationId,
        },
      );
      if (!result.ok) {
        if (result.code === "STALE_REPORT") {
          staleLockedRef.current = true;
          clearTimer();
          onStaleRef.current?.();
          dispatch({
            type: "SAVE_ERROR",
            seq,
            message: result.error,
          });
          return false;
        }
        dispatch({ type: "SAVE_ERROR", seq, message: result.error });
        return false;
      }
      if (result.audited) {
        auditRecordedRef.current = true;
      }
      dispatch({
        type: "SAVE_SUCCESS",
        seq,
        savedAt: result.reportUpdatedAt,
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
      if (staleLockedRef.current) return;
      if (!editOperationIdRef.current) {
        editOperationIdRef.current = crypto.randomUUID();
      }
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
    if (staleLockedRef.current) return false;
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
    isStaleLocked: () => staleLockedRef.current,
  };
}
