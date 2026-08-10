/**
 * 自动保存 single-flight drain queue。
 *
 * 不变量：
 * - 同一时刻最多一个保存请求在途（single-flight），避免并发写使用错误的 baseUpdatedAt。
 * - 请求发出后产生的新编辑进入新的 pending batch；旧请求成功只确认自己 claim 的 batch。
 * - 保存失败时把 claim 的 batch 退回 pending，用户输入不丢。
 * - suspend 期间（语义命令在途）不发起 Snapshot 保存，但保留 pending；resume 后基于新 OCC baseline 继续。
 * - 只有 STALE 恢复 server canonical 时才允许显式丢弃 pending（discardPending）。
 */

export type AutosaveSaveOutcome =
  | { status: "SAVED"; savedAt: string }
  | { status: "FAILED"; message: string }
  /** STALE：调用方已恢复 server canonical，本批次与 pending 一并作废 */
  | { status: "DISCARDED" };

export type AutosaveQueue<TPatch> = {
  /** 登记一批新编辑；与已有 pending 合并（新值覆盖旧值） */
  enqueue: (patch: TPatch) => void;
  hasPendingWork: () => boolean;
  isSaving: () => boolean;
  isSuspended: () => boolean;
  /** 持久化调用时刻已存在的全部编辑；true 表示确实已落盘 */
  drain: () => Promise<boolean>;
  suspend: () => void;
  resume: () => void;
  /** 仅用于 STALE canonical 恢复 */
  discardPending: () => void;
  dirtySeq: () => number;
  savedDirtySeq: () => number;
};

export function createAutosaveQueue<TPatch>(options: {
  merge: (older: TPatch, newer: TPatch) => TPatch;
  save: (patch: TPatch, claim: number) => Promise<AutosaveSaveOutcome>;
  onDirty?: () => void;
  onStart?: () => void;
  onSuccess?: (result: {
    claim: number;
    savedAt: string;
    patch: TPatch;
  }) => void;
  onError?: (message: string) => void;
}): AutosaveQueue<TPatch> {
  let pending: { patch: TPatch } | null = null;
  let dirty = 0;
  let saved = 0;
  let suspendCount = 0;
  let running: Promise<boolean> | null = null;

  /** 合并进 pending：newer 覆盖 older */
  const mergeIntoPending = (older: TPatch) => {
    pending = pending
      ? { patch: options.merge(older, pending.patch) }
      : { patch: older };
  };

  const enqueue = (patch: TPatch) => {
    pending = pending
      ? { patch: options.merge(pending.patch, patch) }
      : { patch };
    dirty += 1;
    options.onDirty?.();
  };

  const runLoop = async (): Promise<boolean> => {
    while (pending && suspendCount === 0) {
      const claimedPatch = pending.patch;
      const claim = dirty;
      pending = null;
      options.onStart?.();

      const outcome = await options.save(claimedPatch, claim);

      if (outcome.status === "DISCARDED") {
        pending = null;
        saved = dirty;
        return false;
      }
      if (outcome.status === "FAILED") {
        // 退回本批次：命令期间的新编辑较新，合并时覆盖旧值
        mergeIntoPending(claimedPatch);
        options.onError?.(outcome.message);
        return false;
      }
      saved = Math.max(saved, claim);
      options.onSuccess?.({
        claim,
        savedAt: outcome.savedAt,
        patch: claimedPatch,
      });
    }
    return true;
  };

  const drain = async (): Promise<boolean> => {
    for (;;) {
      if (running) {
        const ok = await running;
        if (!ok) return false;
        continue;
      }
      if (!pending) return true;
      // 语义命令在途：无法保证此刻落盘，交由 resume 继续
      if (suspendCount > 0) return false;

      const task = runLoop();
      running = task;
      let ok: boolean;
      try {
        ok = await task;
      } finally {
        if (running === task) running = null;
      }
      if (!ok) return false;
    }
  };

  return {
    enqueue,
    hasPendingWork: () => pending !== null,
    isSaving: () => running !== null,
    isSuspended: () => suspendCount > 0,
    drain,
    suspend: () => {
      suspendCount += 1;
    },
    resume: () => {
      suspendCount = Math.max(0, suspendCount - 1);
      if (suspendCount === 0 && pending) {
        void drain();
      }
    },
    discardPending: () => {
      pending = null;
      saved = dirty;
    },
    dirtySeq: () => dirty,
    savedDirtySeq: () => saved,
  };
}
