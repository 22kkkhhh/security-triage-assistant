/**
 * Wazuh JSON 告警确定性适配器。
 * 复用 parseJsonAlert 安全边界；仅对已知路径做显式 mapping，禁止模糊猜测。
 */

import { normalizeRecord } from "@/services/normalization/normalize";
import type {
  NormalizeResult,
  RawKeyValue,
  UnrecognizedItem,
} from "@/services/normalization/types";
import { parseJsonAlert } from "./parseJsonAlert";
import { mapWazuhRuleLevelToRiskLevel } from "./wazuhSeverityPolicy";

const USERNAME_PATHS = [
  "data.srcuser",
  "data.dstuser",
  "data.user",
  "data.username",
] as const;

const UNMAPPED_REASON = "未识别的字段，未映射到任何标准字段";

function firstPresent(
  byPath: Map<string, string>,
  paths: readonly string[],
): { path: string; value: string } | null {
  for (const path of paths) {
    const value = byPath.get(path);
    if (value !== undefined && value.trim().length > 0) {
      return { path, value };
    }
  }
  return null;
}

/**
 * Wazuh JSON text → 显式路径映射 → normalizeRecord(WAZUH)。
 * 未映射路径与 parser 复杂数组 warning 均保留在 unrecognized。
 */
export function normalizeWazuhAlert(text: string): NormalizeResult {
  const { pairs, unrecognized: parserUnrecognized } = parseJsonAlert(text);
  const byPath = new Map(pairs.map((pair) => [pair.rawKey, pair.rawValue]));
  const consumed = new Set<string>();
  const mappedPairs: RawKeyValue[] = [];
  const mappingUnrecognized: UnrecognizedItem[] = [];

  const consume = (path: string): string | undefined => {
    const value = byPath.get(path);
    if (value === undefined) return undefined;
    consumed.add(path);
    return value;
  };

  const pushMapped = (fieldKey: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    mappedPairs.push({ rawKey: fieldKey, rawValue: trimmed });
  };

  const id = consume("id");
  if (id) pushMapped("externalAlertId", id);

  const timestamp = consume("timestamp");
  if (timestamp) pushMapped("alertTime", timestamp);

  const ruleDescription = consume("rule.description");
  if (ruleDescription) pushMapped("alertName", ruleDescription);

  const fullLog = consume("full_log");
  if (fullLog) {
    pushMapped("description", fullLog);
  } else if (ruleDescription) {
    pushMapped("description", ruleDescription);
  }

  const srcIp = consume("data.srcip");
  if (srcIp) pushMapped("sourceIp", srcIp);

  const usernameHit = firstPresent(byPath, USERNAME_PATHS);
  if (usernameHit) {
    consumed.add(usernameHit.path);
    pushMapped("username", usernameHit.value);
  }

  const dstIp = consume("data.dstip");
  if (dstIp) pushMapped("destinationIp", dstIp);

  const dstPort = consume("data.dstport");
  if (dstPort) pushMapped("destinationPort", dstPort);

  const protocol = consume("data.protocol");
  if (protocol) pushMapped("protocol", protocol);

  // provenance：Wazuh 导入固定告警来源文案
  pushMapped("alertSource", "Wazuh");

  const levelRaw = byPath.get("rule.level");
  if (levelRaw !== undefined) {
    consumed.add("rule.level");
    const mapped = mapWazuhRuleLevelToRiskLevel(levelRaw);
    if (mapped.ok) {
      pushMapped("alertSeverity", mapped.riskLevel);
    } else {
      mappingUnrecognized.push({
        rawKey: "rule.level",
        rawValue: levelRaw,
        reason: mapped.reason,
      });
    }
  }

  for (const pair of pairs) {
    if (consumed.has(pair.rawKey)) continue;
    mappingUnrecognized.push({
      rawKey: pair.rawKey,
      rawValue: pair.rawValue,
      reason: UNMAPPED_REASON,
    });
  }

  const normalized = normalizeRecord({
    sourceType: "WAZUH",
    pairs: mappedPairs,
  });

  return {
    ...normalized,
    unrecognized: [
      ...parserUnrecognized,
      ...mappingUnrecognized,
      ...normalized.unrecognized,
    ],
  };
}
