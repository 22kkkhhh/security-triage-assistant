/**
 * B1 接线回归：PersistedCaseWorkbench 的语义命令必须先安全落盘 Snapshot，
 * 不得再用 destructive cancelPendingSave 作为命令前置动作。
 *
 * 行为层竞态由 caseAutosaveEngine.test.ts 覆盖；本文件校验组件接线。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");

/** 每个语义命令 action 调用前必须先取得 lease */
const SEMANTIC_ACTIONS = [
  "updateBusinessContextAction",
  "changeCaseStatusAction",
  "assignCaseAction",
  "setCaseDueAtAction",
  "applyChecklistCommandAction",
  "updateHumanReviewAction",
  "toggleEvidencePinAction",
  "addTimelineEventAction",
  "addInvestigationLeadToChecklistAction",
] as const;

describe("Semantic Command 与 Snapshot autosave 协调", () => {
  it("语义命令都先 beginSemanticCommand 再发送", () => {
    for (const action of SEMANTIC_ACTIONS) {
      const pattern = new RegExp(
        `const lease = await beginSemanticCommand\\(\\);[\\s\\S]{0,600}?${action}\\(`,
      );
      expect(workbench, `${action} 缺少 lease 前置`).toMatch(pattern);
    }
    expect(
      workbench.match(/await beginSemanticCommand\(\)/g)?.length,
    ).toBe(SEMANTIC_ACTIONS.length);
  });

  it("命令均使用 lease.baseUpdatedAt，不再直接读取 getPersistedUpdatedAt", () => {
    expect(workbench).toContain("lease.baseUpdatedAt");
    expect(workbench).not.toContain("const baseUpdatedAt = getPersistedUpdatedAt()");
  });

  it("命令结束后恢复 Snapshot 保存队列", () => {
    expect(workbench.match(/endSemanticCommand\(\);/g)?.length).toBe(
      SEMANTIC_ACTIONS.length,
    );
  });

  it("Snapshot 落盘失败时不发送命令，回滚乐观状态并给出稳定中文提示", () => {
    const marker = "if (!lease.ok) {";
    const blocks: string[] = [];
    let from = workbench.indexOf(marker);
    while (from !== -1) {
      blocks.push(workbench.slice(from, from + 400));
      from = workbench.indexOf(marker, from + marker.length);
    }
    expect(blocks.length).toBe(SEMANTIC_ACTIONS.length);
    for (const block of blocks) {
      expect(block).toContain("SNAPSHOT_BLOCKED_MESSAGE");
      expect(block).toContain("setCommandPending(false);");
      expect(block).toContain("return;");
    }
    expect(workbench).toContain(
      '"尚有未保存内容保存失败，已取消本次操作，请先重试保存。"',
    );
  });

  it("cancelPendingSave 只保留给 STALE canonical 恢复", () => {
    const occurrences = workbench.match(/cancelPendingSave\(\)/g) ?? [];
    expect(occurrences.length).toBe(1);
    const staleBlock = workbench.match(
      /const applyCommandStale = \([\s\S]*?\n  \};/,
    );
    expect(staleBlock?.[0]).toContain("cancelPendingSave()");
    expect(workbench).toContain("staleNotice");
  });

  it("导航前的 flush 由 flushSave 判定，不依赖瞬时 UI 状态", () => {
    expect(workbench).toContain(
      "if (capabilities.canSnapshotWrite) {\n      const ok = await flushSave();",
    );
    expect(workbench).not.toMatch(
      /saveState\.status === "DIRTY"[\s\S]{0,120}await flushSave\(\)/,
    );
  });
});
