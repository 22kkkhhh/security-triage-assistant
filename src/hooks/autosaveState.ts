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
}

export type AutosaveAction =
  | { type: "MARK_DIRTY" }
  | { type: "SAVE_START"; seq: number }
  | { type: "SAVE_SUCCESS"; seq: number; savedAt: string }
  | { type: "SAVE_ERROR"; seq: number; message: string }
  | { type: "CANCEL_PENDING" }
  | { type: "EXTERNAL_SAVED"; savedAt: string; seq: number };

export const initialAutosaveState: AutosaveState = {
  status: "IDLE",
  lastSavedAt: null,
  errorMessage: null,
  saveSeq: 0,
  completedSeq: 0,
};

/**
 * 自动保存 UI 状态机。
 * 仅接受最新 saveSeq 的成功/失败结果，避免旧请求晚到导致状态倒退。
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
      };
    case "SAVE_START":
      return {
        ...state,
        status: "SAVING",
        saveSeq: action.seq,
        errorMessage: null,
      };
    case "SAVE_SUCCESS":
      // 旧请求晚到：忽略，不覆盖更新的 DIRTY/SAVING
      if (action.seq !== state.saveSeq) {
        return state;
      }
      return {
        ...state,
        status: "SAVED",
        completedSeq: action.seq,
        lastSavedAt: action.savedAt,
        errorMessage: null,
      };
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
      // 清脏标记由 commitExternalSave / 调用方决定；此处仅打断待保存展示
      return {
        ...state,
        errorMessage: null,
      };
    case "EXTERNAL_SAVED":
      return {
        ...state,
        status: "SAVED",
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
