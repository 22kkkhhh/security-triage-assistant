import { describe, expect, it } from "vitest";
import {
  autosaveReducer,
  initialAutosaveState,
  nextSaveSeq,
} from "@/hooks/autosaveState";

describe("自动保存状态机", () => {
  it("快速连续保存时旧请求成功不会覆盖新状态", () => {
    let state = initialAutosaveState;
    state = autosaveReducer(state, { type: "MARK_DIRTY" });
    const seqA = nextSaveSeq(state);
    state = autosaveReducer(state, { type: "SAVE_START", seq: seqA });

    state = autosaveReducer(state, { type: "MARK_DIRTY" });
    const seqB = nextSaveSeq(state);
    state = autosaveReducer(state, { type: "SAVE_START", seq: seqB });
    expect(state.saveSeq).toBe(seqB);

    // A 晚到：忽略
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: seqA,
      savedAt: "2026-08-08T13:00:00.000Z",
    });
    expect(state.status).toBe("SAVING");
    expect(state.lastSavedAt).toBeNull();

    // B 成功
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: seqB,
      savedAt: "2026-08-08T13:00:02.000Z",
    });
    expect(state.status).toBe("SAVED");
    expect(state.lastSavedAt).toBe("2026-08-08T13:00:02.000Z");
  });

  it("旧请求失败不会覆盖较新保存的成功状态", () => {
    let state = initialAutosaveState;
    const seqA = 1;
    state = autosaveReducer(state, { type: "SAVE_START", seq: seqA });
    const seqB = 2;
    state = autosaveReducer(state, { type: "SAVE_START", seq: seqB });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: seqB,
      savedAt: "2026-08-08T13:01:00.000Z",
    });
    state = autosaveReducer(state, {
      type: "SAVE_ERROR",
      seq: seqA,
      message: "旧错误",
    });
    expect(state.status).toBe("SAVED");
    expect(state.errorMessage).toBeNull();
  });

  it("保存失败进入 ERROR，且不清除 lastSavedAt（本地业务状态由调用方保留）", () => {
    let state = autosaveReducer(initialAutosaveState, {
      type: "SAVE_START",
      seq: 1,
    });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: 1,
      savedAt: "2026-08-08T12:00:00.000Z",
    });
    state = autosaveReducer(state, { type: "MARK_DIRTY" });
    state = autosaveReducer(state, { type: "SAVE_START", seq: 2 });
    state = autosaveReducer(state, {
      type: "SAVE_ERROR",
      seq: 2,
      message: "数据库写入失败",
    });
    expect(state.status).toBe("ERROR");
    expect(state.errorMessage).toBe("数据库写入失败");
    expect(state.lastSavedAt).toBe("2026-08-08T12:00:00.000Z");
  });

  it("EXTERNAL_SAVED：语义命令成功后标记已保存并提升 saveSeq", () => {
    let state = autosaveReducer(initialAutosaveState, { type: "MARK_DIRTY" });
    state = autosaveReducer(state, {
      type: "EXTERNAL_SAVED",
      savedAt: "2026-08-08T14:00:00.000Z",
      seq: 5,
    });
    expect(state.status).toBe("SAVED");
    expect(state.lastSavedAt).toBe("2026-08-08T14:00:00.000Z");
    expect(state.saveSeq).toBe(5);
    expect(state.completedSeq).toBe(5);
  });

  it("语义命令 EXTERNAL_SAVED 之后，旧 autosave SUCCESS 不得覆盖", () => {
    let state = autosaveReducer(initialAutosaveState, {
      type: "SAVE_START",
      seq: 1,
    });
    state = autosaveReducer(state, {
      type: "EXTERNAL_SAVED",
      savedAt: "2026-08-08T14:10:00.000Z",
      seq: 2,
    });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: 1,
      savedAt: "2026-08-08T14:09:00.000Z",
    });
    expect(state.status).toBe("SAVED");
    expect(state.lastSavedAt).toBe("2026-08-08T14:10:00.000Z");
  });
});
