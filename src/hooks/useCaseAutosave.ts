"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { saveCaseStateAction } from "@/app/(app)/cases/actions";
import {
  createCaseAutosaveEngine,
  type CaseAutosaveEngine,
  type CaseStalePayload,
  type SemanticCommandLease,
  type SnapshotPatchInput,
} from "./caseAutosaveEngine";
import {
  autosaveReducer,
  initialAutosaveState,
  type AutosaveState,
} from "./autosaveState";

const DEFAULT_DEBOUNCE_MS = 1800;

export type { CaseStalePayload, SemanticCommandLease };

/**
 * 案件 Snapshot 自动保存（React 绑定层）。
 * 竞态与队列语义由 createCaseAutosaveEngine 实现：
 * - 仅提交 CaseSnapshotPatch（allowlisted 非语义字段）
 * - 请求在途期间的新编辑不会被旧请求的成功清掉
 * - Semantic Command 经 beginSemanticCommand / endSemanticCommand 协调
 * - STALE 恢复 server canonical 是唯一允许丢弃本地 pending 的路径
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
  const caseIdRef = useRef(caseId);
  const initialSavedAtRef = useRef(options.initialSavedAt ?? null);
  const debounceMsRef = useRef(debounceMs);
  const engineRef = useRef<CaseAutosaveEngine | null>(null);

  useEffect(() => {
    onStaleRef.current = options.onStale;
  }, [options.onStale]);

  useEffect(() => {
    onSavedRef.current = options.onSaved;
  }, [options.onSaved]);

  useEffect(() => {
    caseIdRef.current = caseId;
  }, [caseId]);

  useEffect(() => {
    debounceMsRef.current = debounceMs;
  }, [debounceMs]);

  /** 惰性创建：只在事件回调 / effect 中调用，不在 render 期间读取 ref */
  const getEngine = useCallback((): CaseAutosaveEngine => {
    if (engineRef.current) return engineRef.current;
    const created = createCaseAutosaveEngine({
      getCaseId: () => caseIdRef.current,
      saveCase: saveCaseStateAction,
      dispatch,
      debounceMs: debounceMsRef.current,
      initialSavedAt: initialSavedAtRef.current,
      notifyStale: (payload) => onStaleRef.current?.(payload),
      notifySaved: (patch) => onSavedRef.current?.(patch),
    });
    engineRef.current = created;
    return created;
  }, []);

  const scheduleSave = useCallback(
    (mode: "debounce" | "immediate" = "debounce", patch: SnapshotPatchInput) => {
      getEngine().scheduleSave(mode, patch);
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

  const cancelPendingSave = useCallback(() => {
    getEngine().cancelPendingSave();
  }, [getEngine]);

  const commitExternalSave = useCallback(
    (savedAt: string) => {
      getEngine().commitExternalSave(savedAt);
    },
    [getEngine],
  );

  const beginSemanticCommand = useCallback(
    (): Promise<SemanticCommandLease> => getEngine().beginSemanticCommand(),
    [getEngine],
  );

  const endSemanticCommand = useCallback(() => {
    getEngine().endSemanticCommand();
  }, [getEngine]);

  /** 当前已持久化的 CaseRecord.updatedAt（供 Semantic Command 作 baseUpdatedAt） */
  const getPersistedUpdatedAt = useCallback(
    (): string | null => getEngine().getPersistedUpdatedAt(),
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
    cancelPendingSave,
    commitExternalSave,
    beginSemanticCommand,
    endSemanticCommand,
    getPersistedUpdatedAt,
  };
}
