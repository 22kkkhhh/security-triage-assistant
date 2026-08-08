import type { ObservationStatus } from "@/domain/types";

/** 导入数据来源类型 */
export type ImportSourceType =
  | "DATABASE_AUDIT"
  | "FIREWALL"
  | "AUTH"
  | "VPN"
  | "BASTION_HOST"
  | "DLP"
  | "API_SECURITY"
  | "MANUAL"
  | "OTHER";

export const importSourceTypeLabels: Record<ImportSourceType, string> = {
  DATABASE_AUDIT: "数据库审计",
  FIREWALL: "防火墙",
  AUTH: "认证系统",
  VPN: "VPN",
  BASTION_HOST: "堡垒机",
  DLP: "DLP",
  API_SECURITY: "API 安全",
  MANUAL: "手工录入",
  OTHER: "其他",
};

/**
 * 标准化后的安全输入。
 * 所有无法确定的字段一律为 null（或空数组），
 * 绝不把缺失值解释为 NORMAL。
 */
export interface NormalizedSecurityInput {
  sourceType: ImportSourceType;
  // 基础信息
  alertName: string | null;
  alertTime: string | null;
  alertSource: string | null;
  description: string | null;
  // 身份
  username: string | null;
  sourceIp: string | null;
  failedLoginAttempts: number | null;
  successfulLogin: boolean | null;
  accessedSystems: string[];
  // 数据
  database: string | null;
  tableName: string | null;
  operation: string | null;
  sql: string | null;
  rowsAffected: number | null;
  sensitiveDataTypes: string[];
  baselineAverage: number | null;
  baselineMax: number | null;
  baselineObservationDays: number | null;
  // 网络
  destinationIp: string | null;
  destinationPort: number | null;
  protocol: string | null;
  outboundTransferBytes: number | null;
  externalCommunication: ObservationStatus | null;
}

export function emptyNormalizedInput(
  sourceType: ImportSourceType = "MANUAL",
): NormalizedSecurityInput {
  return {
    sourceType,
    alertName: null,
    alertTime: null,
    alertSource: null,
    description: null,
    username: null,
    sourceIp: null,
    failedLoginAttempts: null,
    successfulLogin: null,
    accessedSystems: [],
    database: null,
    tableName: null,
    operation: null,
    sql: null,
    rowsAffected: null,
    sensitiveDataTypes: [],
    baselineAverage: null,
    baselineMax: null,
    baselineObservationDays: null,
    destinationIp: null,
    destinationPort: null,
    protocol: null,
    outboundTransferBytes: null,
    externalCommunication: null,
  };
}

/** 原始导入数据：一组原始键值对（来自 CSV 行、文本行或手工表单） */
export interface RawKeyValue {
  rawKey: string;
  rawValue: string;
}

export interface RawImportData {
  sourceType: ImportSourceType;
  pairs: RawKeyValue[];
}

export interface MatchedField {
  /** 标准字段 key */
  fieldKey: string;
  rawKey: string;
  rawValue: string;
}

export interface UnrecognizedItem {
  rawKey: string;
  rawValue: string;
  reason: string;
}

export interface NormalizeResult {
  input: NormalizedSecurityInput;
  matched: MatchedField[];
  unrecognized: UnrecognizedItem[];
}
