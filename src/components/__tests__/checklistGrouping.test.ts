import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChecklistItem } from "@/domain/types";
import {
  groupChecklistItemsForDisplay,
  systemChecklistGroupKey,
} from "../checklistGrouping";

function systemItem(
  partial: Pick<ChecklistItem, "id" | "category" | "label" | "relatedRuleId"> &
    Partial<ChecklistItem>,
): ChecklistItem {
  return {
    completed: false,
    note: null,
    origin: "SYSTEM",
    ...partial,
  };
}

function manualItem(
  partial: Pick<ChecklistItem, "id" | "category" | "label"> &
    Partial<ChecklistItem>,
): ChecklistItem {
  return {
    completed: false,
    note: null,
    origin: "MANUAL",
    relatedRuleId: null,
    ...partial,
  };
}

describe("systemChecklistGroupKey", () => {
  it("使用 category + \\0 + label.trim()", () => {
    const item = systemItem({
      id: "a",
      category: "DATA",
      label: "  联系业务负责人  ",
      relatedRuleId: "DATA-001",
    });
    expect(systemChecklistGroupKey(item)).toBe("DATA\0联系业务负责人");
  });
});

describe("groupChecklistItemsForDisplay", () => {
  it("SYSTEM 同 category + 同 label ×3 → 一个 systemGroup，含 3 个独立 id", () => {
    const items = [
      systemItem({
        id: "s1",
        category: "DATA",
        label: "联系业务负责人",
        relatedRuleId: "DATA-001",
      }),
      systemItem({
        id: "s2",
        category: "DATA",
        label: "联系业务负责人",
        relatedRuleId: "DATA-002",
      }),
      systemItem({
        id: "s3",
        category: "DATA",
        label: "联系业务负责人",
        relatedRuleId: "DATA-003",
      }),
    ];

    const display = groupChecklistItemsForDisplay(items);
    expect(display).toHaveLength(1);
    expect(display[0]!.kind).toBe("systemGroup");
    if (display[0]!.kind !== "systemGroup") return;
    expect(display[0].label).toBe("联系业务负责人");
    expect(display[0].items).toHaveLength(3);
    expect(display[0].items.map((i) => i.id)).toEqual(["s1", "s2", "s3"]);
    expect(new Set(display[0].items.map((i) => i.id)).size).toBe(3);
  });

  it("不同 category 的同 label 不合并", () => {
    const items = [
      systemItem({
        id: "d1",
        category: "DATA",
        label: "联系业务负责人",
        relatedRuleId: "DATA-001",
      }),
      systemItem({
        id: "b1",
        category: "BUSINESS",
        label: "联系业务负责人",
        relatedRuleId: "BUSINESS-001",
      }),
    ];

    const display = groupChecklistItemsForDisplay(items);
    expect(display).toHaveLength(2);
    expect(display.every((e) => e.kind === "single")).toBe(true);
  });

  it("MANUAL 同 label 不参与 SYSTEM group", () => {
    const items = [
      systemItem({
        id: "s1",
        category: "DATA",
        label: "联系业务负责人",
        relatedRuleId: "DATA-001",
      }),
      systemItem({
        id: "s2",
        category: "DATA",
        label: "联系业务负责人",
        relatedRuleId: "DATA-002",
      }),
      manualItem({
        id: "m1",
        category: "DATA",
        label: "联系业务负责人",
      }),
    ];

    const display = groupChecklistItemsForDisplay(items);
    expect(display).toHaveLength(2);
    expect(display[0]!.kind).toBe("systemGroup");
    expect(display[1]!.kind).toBe("single");
    if (display[1]!.kind === "single") {
      expect(display[1].item.id).toBe("m1");
      expect(display[1].item.origin).toBe("MANUAL");
    }
  });

  it("单个 SYSTEM item 不被无意义分组", () => {
    const items = [
      systemItem({
        id: "only",
        category: "DATA",
        label: "确认数据是否被导出及去向",
        relatedRuleId: "DATA-001",
      }),
    ];

    const display = groupChecklistItemsForDisplay(items);
    expect(display).toHaveLength(1);
    expect(display[0]!.kind).toBe("single");
    if (display[0]!.kind === "single") {
      expect(display[0].item.id).toBe("only");
    }
  });

  it("保持输入顺序：先出现的 group/single 在前", () => {
    const items = [
      manualItem({ id: "m1", category: "BUSINESS", label: "人工事项" }),
      systemItem({
        id: "s1",
        category: "DATA",
        label: "核查计划任务",
        relatedRuleId: "DATA-001",
      }),
      systemItem({
        id: "s2",
        category: "DATA",
        label: "核查计划任务",
        relatedRuleId: "DATA-002",
      }),
      systemItem({
        id: "u1",
        category: "NETWORK",
        label: "核实源 IP",
        relatedRuleId: "NETWORK-001",
      }),
    ];

    const display = groupChecklistItemsForDisplay(items);
    expect(display.map((e) => e.kind)).toEqual([
      "single",
      "systemGroup",
      "single",
    ]);
  });
});

describe("ChecklistPanel 展示契约", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const src = readFileSync(
    path.join(root, "components/ChecklistPanel.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("使用 groupChecklistItemsForDisplay；不提供 group checkbox / 批量完成", () => {
    expect(src).toContain("groupChecklistItemsForDisplay");
    expect(src).toContain("展开明细");
    expect(src).toContain("系统核查 ·");
    expect(src).toContain("已完成");
    expect(src).not.toContain("批量完成");
    expect(src).not.toContain("全选");
    expect(src).not.toContain("onToggleGroup");
    expect(src).not.toContain("bulk");
  });

  it("标题仍按真实 item 未完成数统计；toggle/note 仍传 item.id", () => {
    expect(src).toContain(
      "待核查事项（${items.filter((i) => !i.completed).length} 项未完成）",
    );
    expect(src).toContain("onToggle(item.id)");
    expect(src).toContain("onEditNote(item.id");
  });

  it("可写 checkbox 仍具备含事项标签的 accessible name（保护 E2E-01 唯一项）", () => {
    expect(src).toMatch(
      /aria-label=\{`\$\{item\.label\}（\$\{item\.completed \? "已完成" : "未完成"\}）`\}/,
    );
  });
});
