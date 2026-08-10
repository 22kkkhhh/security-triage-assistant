/**
 * B1 回归：Case Snapshot autosave 静默数据丢失 / false SAVED。
 *
 * 使用真实 engine（useCaseAutosave 的核心）+ 带 OCC 的假服务端，
 * 验证真实 pending patch 不会因为旧请求成功或语义命令协调而丢失。
 */
import { describe, expect, it } from "vitest";
import {
  createCaseAutosaveEngine,
  type SaveCaseStateFn,
} from "@/hooks/caseAutosaveEngine";
import {
  autosaveReducer,
  hasUnsavedWork,
  initialAutosaveState,
  type AutosaveState,
} from "@/hooks/autosaveState";
import type { CaseSnapshotPatch } from "@/services/persistence/caseSnapshotPatch";
import type { CaseStatus } from "@/domain/types";
import type { PersistedCaseState } from "@/services/persistence/types";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 带 OCC 的假服务端：baseUpdatedAt 不匹配则 STALE */
function createFakeServer() {
  const stored = {
    businessJustification: null as string | null,
    changeTicketId: null as string | null,
    businessOwner: null as string | null,
    conclusionNote: null as string | null,
  };
  let updatedAt = "2026-08-10T00:00:00.000Z";
  let tick = 0;
  const calls: CaseSnapshotPatch[] = [];
  /** 每次调用可被外部延迟/失败 */
  let gate: ((call: number) => Promise<"ok" | "fail" | "throw">) | null = null;

  const nextUpdatedAt = () => {
    tick += 1;
    return `2026-08-10T00:00:0${tick}.000Z`;
  };

  const saveCase: SaveCaseStateFn = async (_caseId, patch) => {
    const callIndex = calls.length;
    calls.push(patch);
    const decision = gate ? await gate(callIndex) : "ok";
    if (decision === "throw") throw new Error("internal socket hangup");
    if (decision === "fail") {
      return { ok: false, error: "案件保存暂未完成，请稍后重试。" };
    }
    if ((patch.baseUpdatedAt ?? null) !== updatedAt) {
      return {
        ok: false,
        error: "案件已被更新",
        code: "STALE" as const,
        updatedAt,
        lastActivityAt: updatedAt,
        status: "INVESTIGATING" as CaseStatus,
        caseState: {
          businessContext: { ...stored },
        } as unknown as PersistedCaseState,
      };
    }
    Object.assign(stored, patch.businessContext ?? {});
    if (patch.humanReview) Object.assign(stored, patch.humanReview);
    updatedAt = nextUpdatedAt();
    return {
      ok: true as const,
      updatedAt,
      status: "INVESTIGATING" as CaseStatus,
    };
  };

  return {
    saveCase,
    calls,
    stored,
    currentUpdatedAt: () => updatedAt,
    /** 外部注入某次请求的时序/结果 */
    setGate: (next: typeof gate) => {
      gate = next;
    },
  };
}

function createHarness(server: ReturnType<typeof createFakeServer>) {
  let state: AutosaveState = {
    ...initialAutosaveState,
    status: "SAVED",
    lastSavedAt: server.currentUpdatedAt(),
  };
  const engine = createCaseAutosaveEngine({
    getCaseId: () => "case-1",
    saveCase: server.saveCase,
    dispatch: (action) => {
      state = autosaveReducer(state, action);
    },
    debounceMs: 1800,
    initialSavedAt: server.currentUpdatedAt(),
  });
  return {
    engine,
    getState: () => state,
  };
}

describe("B1 Case Snapshot autosave：in-flight 竞态", () => {
  it("场景 C：Save A 在途 → Edit B → A 成功后 B 仍 DIRTY，并最终真实落盘", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    const firstCall = deferred();
    server.setGate(async (call) => {
      if (call === 0) await firstCall.promise;
      return "ok";
    });

    engine.scheduleSave("immediate", {
      businessContext: { businessJustification: "A" },
    });
    // A 在途期间产生新编辑
    engine.scheduleSave("immediate", {
      businessContext: { businessJustification: "B" },
    });
    expect(engine.hasPendingWork()).toBe(true);

    firstCall.resolve();
    await engine.flushSave();

    expect(server.calls).toHaveLength(2);
    expect(server.calls[0]?.businessContext?.businessJustification).toBe("A");
    expect(server.calls[1]?.businessContext?.businessJustification).toBe("B");
    // 第二次保存必须用第一次返回的新 updatedAt，否则会被判 STALE
    expect(server.calls[0]?.baseUpdatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(server.calls[1]?.baseUpdatedAt).toBe("2026-08-10T00:00:01.000Z");
    expect(server.stored.businessJustification).toBe("B");
    expect(getState().status).toBe("SAVED");
    expect(hasUnsavedWork(getState())).toBe(false);
  });

  it("场景 C（UI 状态）：A 成功返回时新编辑不得显示为已保存", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    const firstCall = deferred();
    server.setGate(async (call) => {
      if (call === 0) {
        await firstCall.promise;
      }
      return "ok";
    });

    engine.scheduleSave("immediate", {
      businessContext: { businessJustification: "A" },
    });
    engine.scheduleSave("immediate", {
      businessContext: { businessJustification: "B" },
    });
    firstCall.resolve();
    // 让第一次请求完成，但第二批尚未落盘
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getState().status).not.toBe("SAVED");
    expect(hasUnsavedWork(getState())).toBe(true);

    await engine.flushSave();
    expect(getState().status).toBe("SAVED");
  });

  it("并发保存不会使用过期 baseUpdatedAt 互相覆盖", async () => {
    const server = createFakeServer();
    const { engine } = createHarness(server);
    engine.scheduleSave("immediate", {
      businessContext: { changeTicketId: "CR-1" },
    });
    await engine.flushSave();
    engine.scheduleSave("immediate", {
      businessContext: { businessOwner: "张三" },
    });
    await engine.flushSave();

    expect(server.calls[1]?.baseUpdatedAt).toBe("2026-08-10T00:00:01.000Z");
    expect(server.stored.changeTicketId).toBe("CR-1");
    expect(server.stored.businessOwner).toBe("张三");
  });

  it("保存失败时批次退回 pending，重试后不丢内容", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    server.setGate(async (call) => (call === 0 ? "fail" : "ok"));

    engine.scheduleSave("immediate", {
      businessContext: { businessJustification: "重要说明" },
    });
    const failed = await engine.flushSave();
    expect(failed).toBe(false);
    expect(getState().status).toBe("ERROR");
    expect(engine.hasPendingWork()).toBe(true);

    const retried = await engine.retrySave();
    expect(retried).toBe(true);
    expect(server.stored.businessJustification).toBe("重要说明");
    expect(getState().status).toBe("SAVED");
  });

  it("未知异常只暴露稳定中文文案", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    server.setGate(async () => "throw");

    engine.scheduleSave("immediate", {
      businessContext: { businessOwner: "李四" },
    });
    await engine.flushSave();
    expect(getState().errorMessage).toBe("保存暂未完成，请稍后重试。");
    expect(getState().errorMessage).not.toContain("socket");
  });
});

describe("B1 Semantic Command 协调", () => {
  it("场景 A：debounce 未触发就发起命令 → 文本先落盘再取 baseUpdatedAt", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);

    // 仅 debounce，不立即保存
    engine.scheduleSave("debounce", {
      businessContext: { businessJustification: "计划内变更" },
    });
    const lease = await engine.beginSemanticCommand();

    expect(lease.ok).toBe(true);
    expect(server.stored.businessJustification).toBe("计划内变更");
    if (lease.ok) {
      expect(lease.baseUpdatedAt).toBe(server.currentUpdatedAt());
    }
    engine.endSemanticCommand();
    expect(getState().status).toBe("SAVED");
  });

  it("场景 B：changeTicketId / businessOwner dirty 时执行命令不丢失", async () => {
    const server = createFakeServer();
    const { engine } = createHarness(server);
    engine.scheduleSave("debounce", {
      businessContext: { changeTicketId: "CR-2026", businessOwner: "王五" },
    });

    const lease = await engine.beginSemanticCommand();
    expect(lease.ok).toBe(true);
    // 模拟 Checklist complete 成功返回新的 updatedAt
    engine.commitExternalSave("2026-08-10T09:00:00.000Z");
    engine.endSemanticCommand();

    expect(server.stored.changeTicketId).toBe("CR-2026");
    expect(server.stored.businessOwner).toBe("王五");
  });

  it("场景 D：Snapshot flush 失败 → 命令不发送，本地输入仍在 pending", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    server.setGate(async () => "fail");

    engine.scheduleSave("debounce", {
      businessContext: { businessJustification: "未保存内容" },
    });
    const lease = await engine.beginSemanticCommand();

    expect(lease.ok).toBe(false);
    expect(engine.hasPendingWork()).toBe(true);
    expect(getState().status).toBe("ERROR");
    expect(hasUnsavedWork(getState())).toBe(true);
  });

  it("场景 E：命令执行期间的新编辑基于新 updatedAt 继续保存", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);

    const lease = await engine.beginSemanticCommand();
    expect(lease.ok).toBe(true);

    // 命令在途期间用户继续输入
    engine.scheduleSave("immediate", {
      businessContext: { businessJustification: "命令期间输入" },
    });
    expect(server.calls).toHaveLength(0);
    expect(engine.hasPendingWork()).toBe(true);

    // 命令成功：服务端 updatedAt 前进
    const commandUpdatedAt = "2026-08-10T10:00:00.000Z";
    engine.commitExternalSave(commandUpdatedAt);
    expect(getState().status).toBe("DIRTY");

    engine.endSemanticCommand();
    await engine.flushSave();

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.baseUpdatedAt).toBe(commandUpdatedAt);
    expect(engine.hasPendingWork()).toBe(false);
  });

  it("commitExternalSave 不再清除 pending 编辑", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    const held = deferred();
    server.setGate(async () => {
      await held.promise;
      return "ok";
    });
    engine.scheduleSave("debounce", {
      businessContext: { businessOwner: "赵六" },
    });
    engine.commitExternalSave(server.currentUpdatedAt());

    // 语义命令成功不代表 Snapshot 已落盘：继续保存而不是显示已保存
    expect(getState().status).not.toBe("SAVED");
    expect(hasUnsavedWork(getState())).toBe(true);

    held.resolve();
    await engine.flushSave();
    expect(server.stored.businessOwner).toBe("赵六");
  });
});

describe("B1 STALE 语义", () => {
  it("STALE 是唯一丢弃本地 pending 的路径，并恢复 server canonical", async () => {
    const server = createFakeServer();
    const { engine, getState } = createHarness(server);
    let staleCalls = 0;
    const engineWithStale = createCaseAutosaveEngine({
      getCaseId: () => "case-1",
      saveCase: server.saveCase,
      dispatch: () => {},
      debounceMs: 1800,
      // 故意使用过期基线触发 STALE
      initialSavedAt: "1999-01-01T00:00:00.000Z",
      notifyStale: () => {
        staleCalls += 1;
      },
    });

    engineWithStale.scheduleSave("immediate", {
      businessContext: { businessJustification: "会被服务端 canonical 覆盖" },
    });
    const ok = await engineWithStale.flushSave();

    expect(ok).toBe(false);
    expect(staleCalls).toBe(1);
    expect(engineWithStale.hasPendingWork()).toBe(false);
    expect(engineWithStale.getPersistedUpdatedAt()).toBe(
      server.currentUpdatedAt(),
    );

    // cancelPendingSave 明确丢弃：UI 不应残留未保存
    engine.scheduleSave("debounce", {
      businessContext: { changeTicketId: "CR-x" },
    });
    engine.cancelPendingSave();
    expect(engine.hasPendingWork()).toBe(false);
    expect(hasUnsavedWork(getState())).toBe(false);
  });
});
