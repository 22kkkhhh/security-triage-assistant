export type SaveUiStatus = "IDLE" | "DIRTY" | "SAVING" | "SAVED" | "ERROR";

export interface AutosaveState {
  status: SaveUiStatus;
  /** 最近一次成功保存的 ISO 时间 */
  lastSavedAt: string | null;
  errorMessage: string | null;
  /** 已发出的最新保存序号 */
  saveSeq: number;
  /** 最近一次成功完成的序号 */
  completedSeq: number;
  /** 已产生的编辑批次序号 */
  dirtySeq: number;
  /** 已确认持久化的编辑批次序号；小于 dirtySeq 表示仍有未保存内容 */
  savedDirtySeq: number;
}

export type AutosaveAction =
  | { type: "MARK_DIRTY" }
  | { type: "SAVE_START"; seq: number }
  /** claimedDirtySeq：本次请求实际提交的编辑批次；之后产生的编辑不被确认 */
  | {
      type: "SAVE_SUCCESS";
      seq: number;
      savedAt: string;
      claimedDirtySeq?: number;
    }
  | { type: "SAVE_ERROR"; seq: number; message: string }
  | { type: "CANCEL_PENDING" }
  | { type: "EXTERNAL_SAVED"; savedAt: string; seq: number };

export const initialAutosaveState: AutosaveState = {
  status: "IDLE",
  lastSavedAt: null,
  errorMessage: null,
  saveSeq: 0,
  completedSeq: 0,
  dirtySeq: 0,
  savedDirtySeq: 0,
};

/** 仍有未确认落盘的编辑 */
export function hasUnsavedWork(state: AutosaveState): boolean {
  return state.dirtySeq > state.savedDirtySeq;
}

/**
 * 自动保存 UI 状态机。
 * - 仅接受最新 saveSeq 的成功/失败结果，避免旧请求晚到导致状态倒退。
 * - SAVED 只在 dirtySeq 已被完全确认时出现；请求在途期间产生的新编辑保持 DIRTY。
 */
export function autosaveReducer(
  state: AutosaveState,
  action: AutosaveAction,
): AutosaveState {
  switch (action.type) {
    case "MARK_DIRTY":
      return {
        ...state,
        status: "DIRTY",
        errorMessage: null,
        dirtySeq: state.dirtySeq + 1,
      };
    case "SAVE_START":
      return {
        ...state,
        status: "SAVING",
        saveSeq: action.seq,
        errorMessage: null,
      };
    case "SAVE_SUCCESS": {
      // 旧请求晚到：忽略，不覆盖更新的 DIRTY/SAVING
      if (action.seq !== state.saveSeq) {
        return state;
      }
      const savedDirtySeq = Math.max(
        state.savedDirtySeq,
        action.claimedDirtySeq ?? state.dirtySeq,
      );
      return {
        ...state,
        // 请求在途期间产生的新编辑不算已保存
        status: state.dirtySeq > savedDirtySeq ? "DIRTY" : "SAVED",
        completedSeq: action.seq,
        savedDirtySeq,
        lastSavedAt: action.savedAt,
        errorMessage: null,
      };
    }
    case "SAVE_ERROR":
      if (action.seq !== state.saveSeq) {
        return state;
      }
      return {
        ...state,
        status: "ERROR",
        errorMessage: action.message,
      };
    case "CANCEL_PENDING":
      // 仅用于 STALE canonical 恢复：本地 pending 明确作废
      return {
        ...state,
        errorMessage: null,
        savedDirtySeq: state.dirtySeq,
      };
    case "EXTERNAL_SAVED":
      // 语义命令写入了新的 updatedAt，但不代表 Snapshot pending 已落盘
      return {
        ...state,
        status: state.dirtySeq > state.savedDirtySeq ? "DIRTY" : "SAVED",
        saveSeq: action.seq,
        completedSeq: action.seq,
        lastSavedAt: action.savedAt,
        errorMessage: null,
      };
    default:
      return state;
  }
}

/** 供测试：模拟快速连续保存时的状态演进 */
export function nextSaveSeq(state: AutosaveState): number {
  return state.saveSeq + 1;
}
