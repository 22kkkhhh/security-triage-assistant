/**
 * v1.5 Workstream A：Investigation Context Catalog（Domain）。
 *
 * 统一描述 Case 调查上下文的稳定 key、来源字段与 runtime 消费者。
 * 存在性判断与 collectAvailableContextKeys 共享同一 catalog，不引入第二套 missing 逻辑。
 */
import type { SecurityCase, SecurityCaseDraft } from "@/domain/types";

export type InvestigationContextStatus = "PRESENT" | "MISSING" | "UNKNOWN";

export type InvestigationContextSource =
  | "ALERT"
  | "DATA"
  | "NETWORK"
  | "IDENTITY"
  | "BUSINESS";

export type InvestigationContextRuntimeConsumer =
  | "COMPLIANCE"
  | "SECURITY";

/** 稳定 context key（与 ContextRequirement.key / pack ctx 对齐） */
export type InvestigationContextKey =
  | "occurredAt"
  | "accessedRecordCount"
  | "dataCategory"
  | "databaseName"
  | "tableName"
  | "loginSourceIp"
  | "accountName"
  | "accessedSystems"
  | "failedLoginAttempts"
  | "outboundVolume"
  | "externalDestination"
  | "destinationRegion"
  | "internalSourceIp"
  | "changeTicketId"
  | "businessOwner"
  | "businessOwnerConfirmed"
  | "businessJustification"
  | "plannedTaskStatus";

export type InvestigationContextDescriptor = {
  key: InvestigationContextKey;
  label: string;
  source: InvestigationContextSource;
  sourceField: string;
  runtimeConsumers: readonly InvestigationContextRuntimeConsumer[];
  /** 与 collectAvailableContextKeys 一致：key 视为已满足 */
  isPresent: (draft: SecurityCaseDraft | SecurityCase) => boolean;
  /** 源字段处于 UNKNOWN / 未获取状态时标记为 UNKNOWN（区别于 MISSING） */
  isUnknown?: (draft: SecurityCaseDraft | SecurityCase) => boolean;
  summarizeValue?: (draft: SecurityCaseDraft | SecurityCase) => string | null;
};

export type InvestigationContextEntry = {
  key: InvestigationContextKey;
  label: string;
  status: InvestigationContextStatus;
  valueSummary: string | null;
  source: InvestigationContextSource;
  sourceField: string;
  runtimeConsumers: readonly InvestigationContextRuntimeConsumer[];
};

export type InvestigationContextState = {
  entries: InvestigationContextEntry[];
  /** 与 collectAvailableContextKeys 输出一致（确定性排序） */
  availableKeys: string[];
  presentKeys: InvestigationContextKey[];
  missingKeys: InvestigationContextKey[];
  unknownKeys: InvestigationContextKey[];
};

export type ContextModelGap = {
  gapId: string;
  label: string;
  reason: string;
  affectedRuntimes: readonly InvestigationContextRuntimeConsumer[];
  suggestedDomainField: string;
  requiresPersistence: boolean;
};

function summarizeList(values: readonly string[], max = 3): string | null {
  if (values.length === 0) return null;
  const head = values.slice(0, max).join("、");
  if (values.length > max) return `${head} 等 ${values.length} 项`;
  return head;
}

function summarizeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `约 ${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `约 ${Math.round(bytes / 1024 / 1024)}MB`;
  }
  if (bytes >= 1024) {
    return `约 ${Math.round(bytes / 1024)}KB`;
  }
  return `${bytes}B`;
}

/** Catalog 顺序固定，保证 deterministic 输出 */
export const INVESTIGATION_CONTEXT_CATALOG: readonly InvestigationContextDescriptor[] =
  [
    {
      key: "occurredAt",
      label: "事件发生时间",
      source: "ALERT",
      sourceField: "alert.occurredAt",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => Boolean(d.alert.occurredAt),
      summarizeValue: (d) => d.alert.occurredAt,
    },
    {
      key: "accessedRecordCount",
      label: "访问/返回记录数",
      source: "DATA",
      sourceField: "dataContext.accessedRecordCount",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => d.dataContext.accessedRecordCount != null,
      summarizeValue: (d) =>
        d.dataContext.accessedRecordCount == null
          ? null
          : String(d.dataContext.accessedRecordCount),
    },
    {
      key: "dataCategory",
      label: "数据类型/敏感字段",
      source: "DATA",
      sourceField: "dataContext.sensitiveFieldTypes",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => d.dataContext.sensitiveFieldTypes.length > 0,
      summarizeValue: (d) => summarizeList(d.dataContext.sensitiveFieldTypes),
    },
    {
      key: "databaseName",
      label: "数据库名称",
      source: "DATA",
      sourceField: "dataContext.databaseName",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.dataContext.databaseName),
      summarizeValue: (d) => d.dataContext.databaseName,
    },
    {
      key: "tableName",
      label: "数据表名称",
      source: "DATA",
      sourceField: "dataContext.tableName",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.dataContext.tableName),
      summarizeValue: (d) => d.dataContext.tableName,
    },
    {
      key: "loginSourceIp",
      label: "登录来源 IP",
      source: "IDENTITY",
      sourceField: "identityContext.loginSourceIp",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => Boolean(d.identityContext.loginSourceIp),
      summarizeValue: (d) => d.identityContext.loginSourceIp,
    },
    {
      key: "accountName",
      label: "账号名称",
      source: "IDENTITY",
      sourceField: "identityContext.accountName",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.identityContext.accountName),
      summarizeValue: (d) => d.identityContext.accountName,
    },
    {
      key: "accessedSystems",
      label: "访问业务系统",
      source: "IDENTITY",
      sourceField: "identityContext.accessedSystems",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => d.identityContext.accessedSystems.length > 0,
      summarizeValue: (d) => summarizeList(d.identityContext.accessedSystems),
    },
    {
      key: "failedLoginAttempts",
      label: "连续失败认证次数",
      source: "IDENTITY",
      sourceField: "identityContext.failedLoginAttempts",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => d.identityContext.failedLoginAttempts != null,
      summarizeValue: (d) =>
        d.identityContext.failedLoginAttempts == null
          ? null
          : String(d.identityContext.failedLoginAttempts),
    },
    {
      key: "outboundVolume",
      label: "出站流量规模",
      source: "NETWORK",
      sourceField: "networkContext.outboundTransferBytes",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => d.networkContext.outboundTransferBytes != null,
      summarizeValue: (d) =>
        d.networkContext.outboundTransferBytes == null
          ? null
          : summarizeBytes(d.networkContext.outboundTransferBytes),
    },
    {
      key: "externalDestination",
      label: "外部通信对端",
      source: "NETWORK",
      sourceField: "networkContext.externalDestination",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.networkContext.externalDestination),
      summarizeValue: (d) => d.networkContext.externalDestination,
    },
    {
      key: "destinationRegion",
      label: "数据去向/目的地区域",
      source: "NETWORK",
      sourceField: "networkContext.externalDestination",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => Boolean(d.networkContext.externalDestination),
      summarizeValue: (d) => d.networkContext.externalDestination,
    },
    {
      key: "internalSourceIp",
      label: "内网来源 IP",
      source: "NETWORK",
      sourceField: "networkContext.internalSourceIp",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.networkContext.internalSourceIp),
      summarizeValue: (d) => d.networkContext.internalSourceIp,
    },
    {
      key: "changeTicketId",
      label: "变更工单编号",
      source: "BUSINESS",
      sourceField: "businessContext.changeTicketId",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) => Boolean(d.businessContext.changeTicketId),
      summarizeValue: (d) => d.businessContext.changeTicketId,
    },
    {
      key: "businessOwner",
      label: "业务负责人",
      source: "BUSINESS",
      sourceField: "businessContext.businessOwner",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.businessContext.businessOwner),
      summarizeValue: (d) => d.businessContext.businessOwner,
    },
    {
      key: "businessOwnerConfirmed",
      label: "业务负责人确认结果",
      source: "BUSINESS",
      sourceField: "businessContext.ownerVerification",
      runtimeConsumers: ["COMPLIANCE", "SECURITY"],
      isPresent: (d) =>
        d.businessContext.ownerVerification === "CONFIRMED" ||
        d.businessContext.ownerVerification === "NOT_CONFIRMED",
      isUnknown: (d) => d.businessContext.ownerVerification === "UNKNOWN",
      summarizeValue: (d) => d.businessContext.ownerVerification,
    },
    {
      key: "businessJustification",
      label: "业务合理性说明",
      source: "BUSINESS",
      sourceField: "businessContext.businessJustification",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) => Boolean(d.businessContext.businessJustification),
      summarizeValue: (d) => d.businessContext.businessJustification,
    },
    {
      key: "plannedTaskStatus",
      label: "计划任务核查结果",
      source: "BUSINESS",
      sourceField: "businessContext.plannedTaskStatus",
      runtimeConsumers: ["SECURITY"],
      isPresent: (d) =>
        d.businessContext.plannedTaskStatus === "CONFIRMED" ||
        d.businessContext.plannedTaskStatus === "NOT_FOUND",
      isUnknown: (d) => d.businessContext.plannedTaskStatus === "UNKNOWN",
      summarizeValue: (d) => d.businessContext.plannedTaskStatus,
    },
  ] as const;

export const INVESTIGATION_CONTEXT_CATALOG_BY_KEY: Readonly<
  Record<InvestigationContextKey, InvestigationContextDescriptor>
> = Object.fromEntries(
  INVESTIGATION_CONTEXT_CATALOG.map((d) => [d.key, d]),
) as Record<InvestigationContextKey, InvestigationContextDescriptor>;

/**
 * 已知模型缺口：本轮不新增字段，仅记录供后续 Domain 扩展参考。
 */
export const CONTEXT_MODEL_GAPS: readonly ContextModelGap[] = [
  {
    gapId: "operator",
    label: "操作人（operator）",
    reason:
      "TimelineEvent.operator 仅存在于离散时间线条目，无法作为 Case 级稳定 Investigation Context key 供 Compliance ContextRequirement 引用。",
    affectedRuntimes: ["SECURITY"],
    suggestedDomainField:
      "identityContext.primaryOperator 或 alert.primaryActor（Case 级单一字段）",
    requiresPersistence: true,
  },
  {
    gapId: "account-owner",
    label: "账号责任人（account owner）",
    reason:
      "identityContext.accountName 仅表示登录账号，不等同于账号业务责任人/账号属主；Compliance 无法区分「账号名」与「账号 owner」。",
    affectedRuntimes: ["COMPLIANCE", "SECURITY"],
    suggestedDomainField: "identityContext.accountOwner",
    requiresPersistence: true,
  },
  {
    gapId: "business-purpose",
    label: "业务目的（business purpose）",
    reason:
      "businessContext.businessJustification 偏自由文本说明，缺少结构化 businessPurpose 枚举/字段，难以 deterministic 映射到 ContextRequirement。",
    affectedRuntimes: ["COMPLIANCE"],
    suggestedDomainField: "businessContext.businessPurpose",
    requiresPersistence: true,
  },
  {
    gapId: "incident-owner",
    label: "事件负责人（incident owner）",
    reason:
      "humanReview.reviewer 表示最终研判责任人快照，不是调查阶段 incident owner；且无 Case 级 assignment 字段供 Compliance runtime 引用。",
    affectedRuntimes: ["SECURITY"],
    suggestedDomainField: "caseAssignment.incidentOwnerUserId",
    requiresPersistence: true,
  },
];

export function collectInvestigationContextAvailableKeys(
  draft: SecurityCaseDraft | SecurityCase,
): string[] {
  return INVESTIGATION_CONTEXT_CATALOG.filter((d) => d.isPresent(draft)).map(
    (d) => d.key,
  );
}

export function resolveInvestigationContextEntryStatus(
  descriptor: InvestigationContextDescriptor,
  draft: SecurityCaseDraft | SecurityCase,
): InvestigationContextStatus {
  if (descriptor.isPresent(draft)) return "PRESENT";
  if (descriptor.isUnknown?.(draft)) return "UNKNOWN";
  return "MISSING";
}

export function resolveInvestigationContextState(
  draft: SecurityCaseDraft | SecurityCase,
): InvestigationContextState {
  const entries: InvestigationContextEntry[] = INVESTIGATION_CONTEXT_CATALOG.map(
    (descriptor) => {
      const status = resolveInvestigationContextEntryStatus(descriptor, draft);
      return {
        key: descriptor.key,
        label: descriptor.label,
        status,
        valueSummary:
          status === "PRESENT"
            ? (descriptor.summarizeValue?.(draft) ?? null)
            : null,
        source: descriptor.source,
        sourceField: descriptor.sourceField,
        runtimeConsumers: descriptor.runtimeConsumers,
      };
    },
  );

  const availableKeys = collectInvestigationContextAvailableKeys(draft);
  const presentKeys = entries
    .filter((e) => e.status === "PRESENT")
    .map((e) => e.key);
  const missingKeys = entries
    .filter((e) => e.status === "MISSING")
    .map((e) => e.key);
  const unknownKeys = entries
    .filter((e) => e.status === "UNKNOWN")
    .map((e) => e.key);

  return {
    entries,
    availableKeys,
    presentKeys,
    missingKeys,
    unknownKeys,
  };
}
