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
  "data.office365.UserId",
  "user.name",
  "user",
] as const;

const SOURCE_IP_PATHS = ["data.srcip", "data.src_ip", "srcip", "src_ip", "source.ip"] as const;
const DESTINATION_IP_PATHS = ["data.dstip", "data.dst_ip", "data.dest_ip", "dstip", "dst_ip", "dest_ip", "destination.ip"] as const;
const DESTINATION_PORT_PATHS = ["data.dstport", "data.dst_port", "data.dest_port", "dstport", "dst_port", "dest_port", "destination.port"] as const;
const PROTOCOL_PATHS = ["data.protocol", "data.proto", "protocol", "proto", "network.protocol"] as const;
const OPERATION_PATHS = [
  "data.operation",
  "data.command",
  "data.action",
  "data.office365.Operation",
  "operation",
  "command",
  "action",
  "audit.command",
] as const;
const ROW_COUNT_PATHS = ["data.rows", "data.row_count", "rows", "row_count"] as const;
const DATABASE_PATHS = ["data.database", "data.db", "database", "db", "database.name"] as const;
const TABLE_PATHS = ["data.table", "data.table_name", "table", "table_name", "object.name"] as const;
const SENSITIVE_TYPES_PATHS = ["data.sensitive_types", "data.sensitive_data_types", "sensitive_types"] as const;

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

  const consumeFirst = (paths: readonly string[]): string | undefined => {
    const hit = firstPresent(byPath, paths);
    if (!hit) return undefined;
    consumed.add(hit.path);
    return hit.value;
  };

  const pushMapped = (fieldKey: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    mappedPairs.push({ rawKey: fieldKey, rawValue: trimmed });
  };

  const id = consumeFirst(["id", "_id"]);
  if (id) pushMapped("externalAlertId", id);

  const timestamp = consume("timestamp");
  if (timestamp) pushMapped("alertTime", timestamp);

  const ruleDescription = consumeFirst(["rule.description", "alert.signature"]);
  if (ruleDescription) pushMapped("alertName", ruleDescription);

  const fullLog = consume("full_log");
  if (fullLog) {
    pushMapped("description", fullLog);
  } else if (ruleDescription) {
    pushMapped("description", ruleDescription);
  }

  const srcIp = consumeFirst(SOURCE_IP_PATHS);
  if (srcIp) pushMapped("sourceIp", srcIp);

  const usernameHit = firstPresent(byPath, USERNAME_PATHS);
  if (usernameHit) {
    consumed.add(usernameHit.path);
    pushMapped("username", usernameHit.value);
  }

  const dstIp = consumeFirst(DESTINATION_IP_PATHS);
  if (dstIp) pushMapped("destinationIp", dstIp);

  const dstPort = consumeFirst(DESTINATION_PORT_PATHS);
  if (dstPort) pushMapped("destinationPort", dstPort);

  const protocol = consumeFirst(PROTOCOL_PATHS);
  if (protocol) pushMapped("protocol", protocol);

  const operation = consumeFirst(OPERATION_PATHS);
  if (operation) pushMapped("operation", operation);

  const rowCount = consumeFirst(ROW_COUNT_PATHS);
  if (rowCount) pushMapped("rowsAffected", rowCount);

  const database = consumeFirst(DATABASE_PATHS);
  if (database) pushMapped("database", database);

  const table = consumeFirst(TABLE_PATHS);
  if (table) pushMapped("tableName", table);

  const sensitiveTypes = consumeFirst(SENSITIVE_TYPES_PATHS);
  if (sensitiveTypes) pushMapped("sensitiveDataTypes", sensitiveTypes);

  const externalCommunication = consumeFirst([
    "data.external_communication",
    "external_communication",
  ]);
  if (externalCommunication) pushMapped("externalCommunication", externalCommunication);

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
