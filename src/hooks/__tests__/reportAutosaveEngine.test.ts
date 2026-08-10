/**
 * S1 回归：报告 autosave 与 Case 同源的 dirty / in-flight 竞态。
 *
 * 使用真实 engine（useReportAutosave 的核心）+ 假服务端，
 * 验证在途请求成功不会把新编辑抹成已保存，且 flushSave 返回 true 时确实全部落盘。
 */
import { describe, expect, it } from "vitest";
import {
  createReportAutosaveEngine,
  type SaveReportDraftFn,
} from "@/hooks/reportAutosaveEngine";
import {
  autosaveReducer,
  hasUnsavedWork,
  initialAutosaveState,
  type AutosaveState,
} from "@/hooks/autosaveState";
import type { ReportData } from "@/domain/types";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function reportWithSummary(summary: string): ReportData {
  return { summary } as unknown as ReportData;
}

function createFakeReportServer() {
  const saved: string[] = [];
  let reportUpdatedAt = "2026-08-10T00:00:00.000Z";
  let tick = 0;
  let gate: ((call: number) => Promise<"ok" | "stale" | "fail">) | null = null;
  const baseSeen: (string | null)[] = [];

  const saveReportDraft: SaveReportDraftFn = async (
    _caseId,
    report,
    options,
  ) => {
    const callIndex = saved.length;
    saved.push((report as unknown as { summary: string }).summary);
    baseSeen.push(options.baseReportUpdatedAt);
    const decision = gate ? await gate(callIndex) : "ok";
    if (decision === "stale") {
      return {
        ok: false,
        error: "报告已被其他人更新，请刷新后重试。",
        code: "STALE_REPORT",
        reportUpdatedAt,
      };
    }
    if (decision === "fail") {
      return { ok: false, error: "报告保存暂未完成，请稍后重试。" };
    }
    tick += 1;
    reportUpdatedAt = `2026-08-10T00:00:0${tick}.000Z`;
    return {
      ok: true,
      updatedAt: reportUpdatedAt,
      reportUpdatedAt,
      lastActivityAt: reportUpdatedAt,
      audited: callIndex === 0,
    };
  };

  return {
    saveReportDraft,
    saved,
    baseSeen,
    currentUpdatedAt: () => reportUpdatedAt,
    setGate: (next: typeof gate) => {
      gate = next;
    },
  };
}

function createHarness(server: ReturnType<typeof createFakeReportServer>) {
  let state: AutosaveState = {
    ...initialAutosaveState,
    status: "SAVED",
    lastSavedAt: server.currentUpdatedAt(),
  };
  let content = "初稿";
  const engine = createReportAutosaveEngine({
    getCaseId: () => "case-1",
    getReport: () => reportWithSummary(content),
    saveReportDraft: server.saveReportDraft,
    dispatch: (action) => {
      state = autosaveReducer(state, action);
    },
    debounceMs: 1800,
    initialSavedAt: server.currentUpdatedAt(),
    createOperationId: () => "op-1",
  });
  return {
    engine,
    getState: () => state,
    edit: (next: string) => {
      content = next;
    },
  };
}

describe("S1 报告 autosave 竞态", () => {
  it("场景 F：Save A 在途 → Edit B → A 成功不得把 B 抹成已保存", async () => {
    const server = createFakeReportServer();
    const { engine, getState, edit } = createHarness(server);
    const firstCall = deferred();
    server.setGate(async (call) => {
      if (call === 0) await firstCall.promise;
      return "ok";
    });

    edit("第一版");
    engine.scheduleSave("immediate");
    edit("第二版");
    engine.scheduleSave("immediate");

    firstCall.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getState().status).not.toBe("SAVED");
    expect(hasUnsavedWork(getState())).toBe(true);

    await engine.flushSave();
    expect(server.saved.at(-1)).toBe("第二版");
    expect(getState().status).toBe("SAVED");
    expect(hasUnsavedWork(getState())).toBe(false);
  });

  it("场景 G：窗口内 flushSave 必须等 B 真实落盘才返回 true", async () => {
    const server = createFakeReportServer();
    const { engine, edit } = createHarness(server);
    const firstCall = deferred();
    server.setGate(async (call) => {
      if (call === 0) await firstCall.promise;
      return "ok";
    });

    edit("第一版");
    engine.scheduleSave("immediate");
    edit("导出前最后修改");
    engine.scheduleSave("immediate");

    const flushed = engine.flushSave();
    firstCall.resolve();
    expect(await flushed).toBe(true);
    expect(server.saved).toEqual(["第一版", "导出前最后修改"]);
    expect(engine.hasPendingWork()).toBe(false);
  });

  it("连续保存使用服务端最新 reportUpdatedAt 作为 OCC 基线", async () => {
    const server = createFakeReportServer();
    const { engine, edit } = createHarness(server);
    edit("一");
    engine.scheduleSave("immediate");
    await engine.flushSave();
    edit("二");
    engine.scheduleSave("immediate");
    await engine.flushSave();

    expect(server.baseSeen[0]).toBe("2026-08-10T00:00:00.000Z");
    expect(server.baseSeen[1]).toBe("2026-08-10T00:00:01.000Z");
  });

  it("保存失败退回 pending：flushSave 返回 false 且内容仍待保存", async () => {
    const server = createFakeReportServer();
    const { engine, getState, edit } = createHarness(server);
    server.setGate(async (call) => (call === 0 ? "fail" : "ok"));

    edit("失败后的正文");
    engine.scheduleSave("immediate");
    expect(await engine.flushSave()).toBe(false);
    expect(getState().status).toBe("ERROR");
    expect(engine.hasPendingWork()).toBe(true);

    expect(await engine.retrySave()).toBe(true);
    expect(server.saved.at(-1)).toBe("失败后的正文");
  });

  it("场景 H：STALE_REPORT 语义不回归（锁定并停止 autosave）", async () => {
    const server = createFakeReportServer();
    const { engine, getState, edit } = createHarness(server);
    let staleCalls = 0;
    const staleEngine = createReportAutosaveEngine({
      getCaseId: () => "case-1",
      getReport: () => reportWithSummary("冲突正文"),
      saveReportDraft: server.saveReportDraft,
      dispatch: () => {},
      debounceMs: 1800,
      initialSavedAt: server.currentUpdatedAt(),
      createOperationId: () => "op-2",
      notifyStale: () => {
        staleCalls += 1;
      },
    });
    server.setGate(async () => "stale");

    staleEngine.scheduleSave("immediate");
    expect(await staleEngine.flushSave()).toBe(false);
    expect(staleCalls).toBe(1);
    expect(staleEngine.isStaleLocked()).toBe(true);
    expect(staleEngine.hasPendingWork()).toBe(false);

    // 锁定后不再发起新的保存
    const callsAfterLock = server.saved.length;
    staleEngine.scheduleSave("immediate");
    expect(await staleEngine.flushSave()).toBe(false);
    expect(server.saved.length).toBe(callsAfterLock);

    // 另一个实例不受影响
    server.setGate(async () => "ok");
    edit("正常正文");
    engine.scheduleSave("immediate");
    expect(await engine.flushSave()).toBe(true);
    expect(getState().status).toBe("SAVED");
  });
});
