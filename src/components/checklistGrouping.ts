/**
 * Checklist 展示层分组：仅折叠同 category + 同 label 的 SYSTEM item，
 * 不合并数据层 identity（item.id / relatedRuleId 保持独立）。
 */
import type { ChecklistItem, SecurityDomain } from "@/domain/types";

export type ChecklistDisplayEntry =
  | { kind: "single"; item: ChecklistItem }
  | {
      kind: "systemGroup";
      /** category + "\\0" + label.trim() */
      key: string;
      category: SecurityDomain;
      /** 展示用 label（取组内首个 item 的原始 label） */
      label: string;
      /** 长度 ≥ 2 的真实 ChecklistItem，保持输入顺序 */
      items: ChecklistItem[];
    };

/** SYSTEM 展示分组键：同 category + 完全相同的展示 label（trim 后）。 */
export function systemChecklistGroupKey(item: ChecklistItem): string {
  return `${item.category}\0${item.label.trim()}`;
}

/**
 * 将 checklist 转为展示条目。
 * - SYSTEM 且同 key 出现 ≥2 次 → systemGroup
 * - SYSTEM 仅 1 次 → single（不包成复杂 group）
 * - MANUAL / 非 SYSTEM → single，不参与 SYSTEM 分组
 */
export function groupChecklistItemsForDisplay(
  items: readonly ChecklistItem[],
): ChecklistDisplayEntry[] {
  const systemBuckets = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    if (item.origin !== "SYSTEM") continue;
    const key = systemChecklistGroupKey(item);
    const bucket = systemBuckets.get(key);
    if (bucket) bucket.push(item);
    else systemBuckets.set(key, [item]);
  }

  const emittedKeys = new Set<string>();
  const result: ChecklistDisplayEntry[] = [];

  for (const item of items) {
    if (item.origin !== "SYSTEM") {
      result.push({ kind: "single", item });
      continue;
    }

    const key = systemChecklistGroupKey(item);
    if (emittedKeys.has(key)) continue;
    emittedKeys.add(key);

    const bucket = systemBuckets.get(key) ?? [item];
    if (bucket.length === 1) {
      result.push({ kind: "single", item: bucket[0]! });
    } else {
      result.push({
        kind: "systemGroup",
        key,
        category: bucket[0]!.category,
        label: bucket[0]!.label,
        items: bucket,
      });
    }
  }

  return result;
}
