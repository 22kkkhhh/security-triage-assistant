/**
 * Timeline / Checklist UI 语义约束（不依赖渲染库的轻量源码契约测试）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("TimelinePanel UI 语义", () => {
  const src = readSrc("components/TimelinePanel.tsx");

  it("新建类型不含「人工处置」；标题为补充事件时间线", () => {
    expect(src).toContain("补充事件时间线");
    expect(src).toContain("用于补充案件实际发生的事件事实");
    expect(src).toContain("人工补充");
    expect(src).not.toMatch(/eventTypeOptions[\s\S]*人工处置/);
    expect(src).not.toContain('"人工处置"');
    expect(src).not.toContain("添加人工处置记录");
    expect(src).toContain('"认证"');
    expect(src).toContain('"告警"');
    expect(src).toContain('"其他"');
  });

  it("HUMAN source 展示「人工补充」而非「人工处置」", () => {
    expect(src).toMatch(/source === "HUMAN"[\s\S]*人工补充/);
    expect(src).not.toMatch(/source === "HUMAN"[\s\S]*人工处置/);
  });
});

describe("ChecklistPanel UI 删除权限", () => {
  const src = readSrc("components/ChecklistPanel.tsx");

  it("仅 MANUAL 显示删除；SYSTEM 不渲染删除按钮", () => {
    expect(src).toContain('item.origin === "MANUAL"');
    expect(src).toContain("删除");
    // 删除按钮必须包在 MANUAL 条件内
    expect(src).toMatch(
      /origin === "MANUAL"[\s\S]*删除[\s\S]*\)\s*\}/,
    );
  });
});
