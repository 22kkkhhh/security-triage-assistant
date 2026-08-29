import { normalizeRecord } from "@/services/normalization/normalize";
import type {
  NormalizeResult,
  RawKeyValue,
} from "@/services/normalization/types";

/**
 * pgAudit SESSION 日志字段（CSV 形式）：
 * AUDIT: SESSION,statement_id,substatement_id,class,command,object_type,
 * object_name,statement,parameter
 *
 * pgAudit 没有统一的事件时间字段，因此时间保持为空；原始审计行由
 * 调用方按现有 RawAlertRecord 脱敏策略留存，标准化结果只保留调查需要的字段。
 */
export interface PgAuditRecord {
  auditType: string;
  statementId: string;
  substatementId: string;
  auditClass: string;
  command: string;
  objectType: string;
  objectName: string;
  statement: string;
  parameter: string;
}

export class PgAuditParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgAuditParseError";
  }
}

/** CSV 分割器：支持双引号包裹字段及双引号转义。 */
function splitCsv(value: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quoted) throw new PgAuditParseError("pgAudit CSV 引号未闭合");
  fields.push(current.trim());
  return fields;
}

function stableFingerprint(value: string): string {
  // 浏览器与 Node 均可运行的确定性指纹，仅用于幂等 ID，不承担密码学用途。
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseFields(text: string): PgAuditRecord {
  const trimmed = text.trim();
  if (!trimmed.startsWith("AUDIT: ")) {
    throw new PgAuditParseError("不是 pgAudit SESSION 日志（缺少 AUDIT: 前缀）");
  }

  let fields = splitCsv(trimmed.slice("AUDIT: ".length));
  // pgAudit 的 statement 字段在常见 syslog 输出中可能未加引号；
  // 此时其中的逗号会被 CSV 分割器拆开。前 7 个字段与最后 parameter
  // 位置固定，因此把中间字段重新合并为 statement。
  if (fields.length > 9) {
    fields = [
      ...fields.slice(0, 7),
      fields.slice(7, -1).join(","),
      fields[fields.length - 1],
    ];
  }
  if (fields.length !== 9) {
    throw new PgAuditParseError(`pgAudit 字段数量无效：期望 9 个，实际 ${fields.length} 个`);
  }

  const [auditType, statementId, substatementId, auditClass, command, objectType, objectName, statement, parameter] = fields;
  if (auditType !== "SESSION") {
    throw new PgAuditParseError(`暂不支持 pgAudit ${auditType} 类型，仅支持 SESSION`);
  }
  if (!statementId || !substatementId || !auditClass || !command) {
    throw new PgAuditParseError("pgAudit 缺少必要的语句标识或操作类型");
  }

  return {
    auditType,
    statementId,
    substatementId,
    auditClass,
    command,
    objectType,
    objectName,
    statement,
    parameter,
  };
}

/**
 * 将单条 pgAudit SESSION 文本转为现有 DATABASE_AUDIT 标准结果。
 * 不新增 Case / RawAlert / Checklist 模型，调用方可直接复用现有创建命令。
 */
export function normalizePgAuditLine(text: string): NormalizeResult {
  const record = parseFields(text);
  const raw = text.trim();
  const pairs: RawKeyValue[] = [
    { rawKey: "externalAlertId", rawValue: `pgaudit:${stableFingerprint(raw)}` },
    { rawKey: "alertName", rawValue: `pgAudit ${record.command}` },
    { rawKey: "alertSource", rawValue: "pgAudit" },
    { rawKey: "description", rawValue: `${record.auditClass} ${record.command}${record.objectName ? ` ${record.objectName}` : ""}` },
    { rawKey: "operation", rawValue: record.command },
  ];

  if (record.objectName) pairs.push({ rawKey: "tableName", rawValue: record.objectName });
  if (record.statement && record.statement !== "<not logged>") {
    pairs.push({ rawKey: "sql", rawValue: record.statement });
  }

  const normalized = normalizeRecord({ sourceType: "DATABASE_AUDIT", pairs });
  const metadata = [
    ["pgAudit.auditType", record.auditType],
    ["pgAudit.statementId", record.statementId],
    ["pgAudit.substatementId", record.substatementId],
    ["pgAudit.class", record.auditClass],
    ["pgAudit.objectType", record.objectType],
    ["pgAudit.parameter", record.parameter],
  ] as const;

  return {
    ...normalized,
    unrecognized: [
      ...normalized.unrecognized,
      ...metadata.map(([rawKey, rawValue]) => ({
        rawKey,
        rawValue,
        reason: "pgAudit 元数据已保留，未映射为案件字段",
      })),
    ],
  };
}

export function parsePgAuditText(text: string): NormalizeResult[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new PgAuditParseError("pgAudit 文本为空");
  return lines.map(normalizePgAuditLine);
}
