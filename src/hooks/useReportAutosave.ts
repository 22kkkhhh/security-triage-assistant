"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveReportDraftAction } from "@/app/(app)/cases/reportActions";
import type { ReportData } from "@/domain/types";
import {
  createReportAutosaveEngine,
  type ReportAutosaveEngine,
} from "./reportAutosaveEngine";
import {
  autosaveReducer,
  initialAutosaveState,
  type AutosaveState,
} from "./autosaveState";

const DEFAULT_DEBOUNCE_MS = 1800;

/**
 * 报告草稿自动保存（React 绑定层）。
 * 竞态与队列语义由 createReportAutosaveEngine 实现：
 * - 请求在途期间的新编辑不会被旧请求的成功抹成已保存
 * - flushSave 返回 true 表示调用时刻的全部编辑都已真实持久化
 * - STALE_REPORT 锁定语义不变
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
  const caseIdRef = useRef(caseId);
  const initialSavedAtRef = useRef(options.initialSavedAt ?? null);
  const debounceMsRef = useRef(debounceMs);
  const engineRef = useRef<ReportAutosaveEngine | null>(null);

  useEffect(() => {
    getReportRef.current = options.getReport;
  }, [options.getReport]);

  useEffect(() => {
    onStaleRef.current = options.onStale;
  }, [options.onStale]);

  useEffect(() => {
    caseIdRef.current = caseId;
  }, [caseId]);

  useEffect(() => {
    debounceMsRef.current = debounceMs;
  }, [debounceMs]);

  /** 惰性创建：只在事件回调 / effect 中调用，不在 render 期间读取 ref */
  const getEngine = useCallback((): ReportAutosaveEngine => {
    if (engineRef.current) return engineRef.current;
    const created = createReportAutosaveEngine({
      getCaseId: () => caseIdRef.current,
      getReport: () => getReportRef.current(),
      saveReportDraft: saveReportDraftAction,
      dispatch,
      debounceMs: debounceMsRef.current,
      initialSavedAt: initialSavedAtRef.current,
      createOperationId: () => crypto.randomUUID(),
      notifyStale: () => onStaleRef.current?.(),
    });
    engineRef.current = created;
    return created;
  }, []);

  const scheduleSave = useCallback(
    (mode: "debounce" | "immediate" = "debounce") => {
      getEngine().scheduleSave(mode);
    },
    [getEngine],
  );

  const flushSave = useCallback(
    (): Promise<boolean> => getEngine().flushSave(),
    [getEngine],
  );

  const retrySave = useCallback(
    (): Promise<boolean> => getEngine().retrySave(),
    [getEngine],
  );

  const isStaleLocked = useCallback(
    (): boolean => getEngine().isStaleLocked(),
    [getEngine],
  );

  useEffect(
    () => () => {
      engineRef.current?.dispose();
    },
    [],
  );

  return {
    saveState: state as AutosaveState,
    scheduleSave,
    flushSave,
    retrySave,
    isStaleLocked,
  };
}
