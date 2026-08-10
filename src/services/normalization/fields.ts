import type { NormalizedSecurityInput } from "./types";

export type NormalizedFieldType =
  | "string"
  | "number"
  | "list"
  | "boolean"
  | "status";

export type FieldGroup = "基本告警" | "身份" | "数据" | "历史基线" | "网络";

export interface FieldDef {
  key: keyof Omit<NormalizedSecurityInput, "sourceType">;
  label: string;
  group: FieldGroup;
  type: NormalizedFieldType;
  /** 别名表：统一小写比较，必须精确匹配，避免误映射 */
  aliases: string[];
}

/**
 * 标准字段注册表：所有字段别名集中维护在此，
 * UI 与其他服务不得各自实现字段映射逻辑。
 */
export const fieldDefs: FieldDef[] = [
  // 基本告警
  {
    key: "externalAlertId",
    label: "外部告警 ID",
    group: "基本告警",
    type: "string",
    aliases: [
      "external_alert_id",
      "original_alert_id",
      "alert_id",
      "event_id",
      "外部告警id",
      "原始告警id",
    ],
  },
  {
    key: "alertName",
    label: "告警名称",
    group: "基本告警",
    type: "string",
    aliases: ["alertname", "alert_name", "alert", "title", "name", "告警名称", "告警标题", "名称"],
  },
  {
    key: "alertTime",
    label: "告警时间",
    group: "基本告警",
    type: "string",
    aliases: ["alerttime", "alert_time", "time", "occurred_at", "timestamp", "告警时间", "发生时间", "时间"],
  },
  {
    key: "alertSource",
    label: "告警来源",
    group: "基本告警",
    type: "string",
    aliases: ["alert_source", "alert_source_system", "告警来源", "来源系统"],
  },
  {
    key: "description",
    label: "告警描述",
    group: "基本告警",
    type: "string",
    aliases: ["description", "desc", "detail", "告警描述", "描述"],
  },
  // 身份
  {
    key: "username",
    label: "账号",
    group: "身份",
    type: "string",
    aliases: ["user", "username", "account", "user_name", "账号", "用户", "用户名"],
  },
  {
    key: "sourceIp",
    label: "源 IP",
    group: "身份",
    type: "string",
    aliases: ["src_ip", "source_ip", "sourceip", "client_ip", "remote_addr", "源ip", "来源ip"],
  },
  {
    key: "failedLoginAttempts",
    label: "连续失败认证次数",
    group: "身份",
    type: "number",
    aliases: ["failed_logins", "failed_attempts", "failed_login_attempts", "失败次数", "认证失败次数"],
  },
  {
    key: "successfulLogin",
    label: "是否登录成功",
    group: "身份",
    type: "boolean",
    aliases: ["successful_login", "login_success", "登录成功", "是否登录成功"],
  },
  {
    key: "accessedSystems",
    label: "涉及业务系统",
    group: "身份",
    type: "list",
    aliases: ["accessed_systems", "systems", "访问系统", "涉及系统"],
  },
  // 数据
  {
    key: "database",
    label: "数据库",
    group: "数据",
    type: "string",
    aliases: ["db", "db_name", "database", "数据库"],
  },
  {
    key: "tableName",
    label: "数据表",
    group: "数据",
    type: "string",
    aliases: ["table", "table_name", "数据表", "表名"],
  },
  {
    key: "operation",
    label: "操作类型",
    group: "数据",
    type: "string",
    aliases: ["operation", "op", "操作", "操作类型"],
  },
  {
    key: "sql",
    label: "SQL 语句",
    group: "数据",
    type: "string",
    aliases: ["sql", "sql_text", "语句", "sql语句"],
  },
  {
    key: "rowsAffected",
    label: "访问量（行数）",
    group: "数据",
    type: "number",
    aliases: ["rows", "records", "row_count", "affected_rows", "访问量", "数据量"],
  },
  {
    key: "sensitiveDataTypes",
    label: "涉及敏感字段",
    group: "数据",
    type: "list",
    aliases: ["sensitive_types", "sensitive_data_types", "敏感字段", "敏感数据类型"],
  },
  // 历史基线
  {
    key: "baselineAverage",
    label: "历史平均访问量",
    group: "历史基线",
    type: "number",
    aliases: ["baseline_avg", "baseline_average", "历史平均", "基线平均值"],
  },
  {
    key: "baselineMax",
    label: "历史最大访问量",
    group: "历史基线",
    type: "number",
    aliases: ["baseline_max", "历史最大", "基线最大值"],
  },
  {
    key: "baselineObservationDays",
    label: "基线观察天数",
    group: "历史基线",
    type: "number",
    aliases: ["baseline_days", "observation_days", "基线天数", "观察天数"],
  },
  // 网络
  {
    key: "destinationIp",
    label: "目的 IP",
    group: "网络",
    type: "string",
    aliases: ["dst_ip", "destination_ip", "dest_ip", "目的ip", "目标ip"],
  },
  {
    key: "destinationPort",
    label: "目的端口",
    group: "网络",
    type: "number",
    aliases: ["dst_port", "destination_port", "dest_port", "目的端口", "目标端口"],
  },
  {
    key: "protocol",
    label: "协议",
    group: "网络",
    type: "string",
    aliases: ["protocol", "proto", "协议"],
  },
  {
    key: "outboundTransferBytes",
    label: "出站流量（字节）",
    group: "网络",
    type: "number",
    aliases: ["outbound_bytes", "outbound_transfer_bytes", "transfer_bytes", "出站字节数", "出站流量"],
  },
  {
    key: "externalCommunication",
    label: "是否存在公网通信",
    group: "网络",
    type: "status",
    aliases: ["external_communication", "external_comm", "公网通信", "异常公网通信"],
  },
];

const aliasIndex = new Map<string, FieldDef>();
for (const def of fieldDefs) {
  aliasIndex.set(def.key.toLowerCase(), def);
  for (const alias of def.aliases) {
    aliasIndex.set(alias.toLowerCase(), def);
  }
}

/**
 * 按别名精确匹配标准字段（大小写不敏感、去除首尾空白）。
 * 未命中返回 null，绝不模糊猜测。
 */
export function matchFieldByHeader(header: string): FieldDef | null {
  const normalized = header.trim().toLowerCase();
  if (!normalized) return null;
  return aliasIndex.get(normalized) ?? null;
}
