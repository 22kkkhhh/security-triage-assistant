import type {
  Evidence,
  SecurityCaseDraft,
  TimelineEvent,
} from "@/domain/types";

export type DataLifecycleStageKey =
  | "COLLECTION"
  | "STORAGE"
  | "USE"
  | "PROCESSING"
  | "SHARING"
  | "EXPORT"
  | "ARCHIVE"
  | "DELETION";

export type DataLifecycleStageStatus =
  | "OBSERVED"
  | "POSSIBLE"
  | "NOT_OBSERVED"
  | "INSUFFICIENT";

export interface DataLifecycleReference {
  kind: "EVIDENCE" | "TIMELINE";
  id: string;
  label: string;
}

export interface DataLifecycleStage {
  key: DataLifecycleStageKey;
  title: string;
  status: DataLifecycleStageStatus;
  summary: string;
  references: DataLifecycleReference[];
}

export interface DataLifecycleProjection {
  stages: DataLifecycleStage[];
  observedCount: number;
  possibleCount: number;
  hasDataSource: boolean;
}

const stageDefinitions: Array<{
  key: DataLifecycleStageKey;
  title: string;
  keywords: string[];
}> = [
  { key: "COLLECTION", title: "采集 / 生成", keywords: ["采集", "收集", "collect", "capture", "ingest", "导入", "上报"] },
  { key: "STORAGE", title: "存储", keywords: ["存储", "落库", "数据库", "数据表", "database", "table", "storage"] },
  { key: "USE", title: "使用 / 查询", keywords: ["查询", "访问", "读取", "select", "query", "read", "数据访问"] },
  { key: "PROCESSING", title: "加工 / 处理", keywords: ["加工", "处理", "转换", "transform", "update", "insert", "分析"] },
  { key: "SHARING", title: "共享 / 传输", keywords: ["共享", "传输", "外发", "通信", "transfer", "share", "upload"] },
  { key: "EXPORT", title: "导出", keywords: ["导出", "下载", "export", "download", "extract"] },
  { key: "ARCHIVE", title: "归档", keywords: ["归档", "archive"] },
  { key: "DELETION", title: "删除 / 销毁", keywords: ["删除", "清理", "销毁", "delete", "destroy", "purge"] },
];

function includesKeyword(value: string, keywords: string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase()));
}

function uniqueReferences(references: DataLifecycleReference[]): DataLifecycleReference[] {
  return Array.from(new Map(references.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values());
}

function matchingReferences(
  definition: (typeof stageDefinitions)[number],
  draft: SecurityCaseDraft,
  evidences: Evidence[],
  timeline: TimelineEvent[],
): DataLifecycleReference[] {
  const references: DataLifecycleReference[] = [];
  const alertText = `${draft.alert.title} ${draft.alert.description} ${draft.alert.source}`;
  if (includesKeyword(alertText, definition.keywords)) {
    references.push({ kind: "TIMELINE", id: `alert:${draft.alert.originalAlertId ?? "case"}`, label: "案件告警" });
  }
  for (const event of timeline) {
    if (includesKeyword(`${event.eventType} ${event.title} ${event.description}`, definition.keywords)) {
      references.push({ kind: "TIMELINE", id: event.id, label: event.title });
    }
  }
  for (const evidence of evidences) {
    if (includesKeyword(`${evidence.title} ${evidence.summary}`, definition.keywords)) {
      references.push({ kind: "EVIDENCE", id: evidence.evidenceId, label: evidence.title });
    }
  }
  return uniqueReferences(references);
}

function dataEvidence(evidences: Evidence[]): Evidence[] {
  return evidences.filter((evidence) =>
    evidence.sourceType === "DATABASE_AUDIT" || evidence.sourceType === "BUSINESS_SYSTEM_LOG",
  );
}

function classifyStage(
  definition: (typeof stageDefinitions)[number],
  draft: SecurityCaseDraft,
  evidences: Evidence[],
  timeline: TimelineEvent[],
): DataLifecycleStage {
  const references = matchingReferences(definition, draft, evidences, timeline);
  const dataSources = dataEvidence(evidences);
  const operation = draft.dataContext.operationType ?? "";
  const dataAccessObserved =
    draft.dataContext.accessedRecordCount !== null ||
    draft.dataContext.accessStatus !== "UNKNOWN" ||
    operation.length > 0;
  const transferObserved =
    draft.networkContext.outboundTransferBytes !== null ||
    draft.networkContext.externalCommunication === "ABNORMAL";
  const stageObserved =
    references.length > 0 ||
    (definition.key === "STORAGE" &&
      (draft.dataContext.databaseName !== null || draft.dataContext.tableName !== null)) ||
    (definition.key === "USE" && dataAccessObserved) ||
    (definition.key === "PROCESSING" && includesKeyword(operation, definition.keywords)) ||
    (definition.key === "SHARING" && transferObserved) ||
    (definition.key === "EXPORT" && includesKeyword(operation, definition.keywords));

  if (stageObserved) {
    const reason = references.length > 0
      ? `已关联 ${references.length} 条时间线/证据`
      : "案件结构化事实已记录";
    return { ...definition, status: "OBSERVED", summary: reason, references };
  }

  const stageMayBeRelevant =
    (definition.key === "STORAGE" && dataSources.length > 0) ||
    (definition.key === "SHARING" && draft.networkContext.externalDestination !== null) ||
    (definition.key === "PROCESSING" && dataAccessObserved);
  if (stageMayBeRelevant) {
    return {
      ...definition,
      status: "POSSIBLE",
      summary: "已有相关数据，但缺少该阶段的直接操作记录",
      references,
    };
  }

  const hasAnySource = Boolean(draft.alert.title || evidences.length > 0 || timeline.length > 0);
  return {
    ...definition,
    status: hasAnySource ? "NOT_OBSERVED" : "INSUFFICIENT",
    summary: hasAnySource
      ? "在当前已接入事实中未发现该阶段事件"
      : "当前没有该阶段可用的直接来源",
    references,
  };
}

export function buildDataLifecycleProjection(input: {
  draft: SecurityCaseDraft;
  evidences: Evidence[];
  timeline: TimelineEvent[];
}): DataLifecycleProjection {
  const stages = stageDefinitions.map((definition) =>
    classifyStage(definition, input.draft, input.evidences, input.timeline),
  );
  return {
    stages,
    observedCount: stages.filter((stage) => stage.status === "OBSERVED").length,
    possibleCount: stages.filter((stage) => stage.status === "POSSIBLE").length,
    hasDataSource: Boolean(
      input.draft.alert.title || input.evidences.length > 0 || input.timeline.length > 0,
    ),
  };
}
