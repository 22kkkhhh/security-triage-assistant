import { describe, expect, it } from "vitest";
import {
  autosaveReducer,
  hasUnsavedWork,
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

  it("EXTERNAL_SAVED：无待保存编辑时标记已保存并提升 saveSeq", () => {
    const state = autosaveReducer(initialAutosaveState, {
      type: "EXTERNAL_SAVED",
      savedAt: "2026-08-08T14:00:00.000Z",
      seq: 5,
    });
    expect(state.status).toBe("SAVED");
    expect(state.lastSavedAt).toBe("2026-08-08T14:00:00.000Z");
    expect(state.saveSeq).toBe(5);
    expect(state.completedSeq).toBe(5);
    expect(hasUnsavedWork(state)).toBe(false);
  });

  it("B1：语义命令成功不得把待保存 Snapshot 显示成已保存", () => {
    let state = autosaveReducer(initialAutosaveState, { type: "MARK_DIRTY" });
    state = autosaveReducer(state, {
      type: "EXTERNAL_SAVED",
      savedAt: "2026-08-08T14:00:00.000Z",
      seq: 5,
    });
    expect(state.status).toBe("DIRTY");
    expect(hasUnsavedWork(state)).toBe(true);
    expect(state.lastSavedAt).toBe("2026-08-08T14:00:00.000Z");
  });

  it("B1：请求在途期间的新编辑不会被旧请求成功确认", () => {
    let state = autosaveReducer(initialAutosaveState, { type: "MARK_DIRTY" });
    const claimedDirtySeq = state.dirtySeq;
    state = autosaveReducer(state, { type: "SAVE_START", seq: 1 });
    // 请求在途期间用户继续输入
    state = autosaveReducer(state, { type: "MARK_DIRTY" });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: 1,
      savedAt: "2026-08-08T15:00:00.000Z",
      claimedDirtySeq,
    });
    expect(state.status).toBe("DIRTY");
    expect(hasUnsavedWork(state)).toBe(true);

    // 新批次保存成功后才真正 SAVED
    const nextClaim = state.dirtySeq;
    state = autosaveReducer(state, { type: "SAVE_START", seq: 2 });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: 2,
      savedAt: "2026-08-08T15:00:02.000Z",
      claimedDirtySeq: nextClaim,
    });
    expect(state.status).toBe("SAVED");
    expect(hasUnsavedWork(state)).toBe(false);
  });

  it("CANCEL_PENDING（STALE canonical 恢复）明确丢弃本地待保存", () => {
    let state = autosaveReducer(initialAutosaveState, { type: "MARK_DIRTY" });
    state = autosaveReducer(state, { type: "CANCEL_PENDING" });
    expect(hasUnsavedWork(state)).toBe(false);
    state = autosaveReducer(state, {
      type: "EXTERNAL_SAVED",
      savedAt: "2026-08-08T16:00:00.000Z",
      seq: 9,
    });
    expect(state.status).toBe("SAVED");
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
