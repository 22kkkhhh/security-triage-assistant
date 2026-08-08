import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CaseStatus, ReportData } from "@/domain/types";
import {
  buildSystemsSearchText,
  countPendingChecklist,
  rowToListItem,
  rowToPersistedCase,
  toPersistedCaseState,
} from "./caseMapper";
import type {
  CaseListItem,
  CreateCaseInput,
  ListCasesQuery,
  PersistedCase,
  PersistedCaseState,
  SaveCaseStateInput,
} from "./types";

/** 可注入事务客户端（与 Audit 同事务） */
export type CaseDbClient = Prisma.TransactionClient | typeof prisma;

/** Domain 对象 → Prisma Json 字段（结构化克隆，去掉不可序列化内容） */
function toJsonValue(value: PersistedCaseState | ReportData): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** stale autosave 与语义命令竞态时拒绝覆盖 */
export class StaleCaseStateError extends Error {
  readonly code = "STALE" as const;
  /** 服务器当前 canonical case（供客户端恢复） */
  readonly currentCase: PersistedCase | null;
  constructor(
    message = "案件已发生更新，已刷新到最新状态。",
    currentCase: PersistedCase | null = null,
  ) {
    super(message);
    this.name = "StaleCaseStateError";
    this.currentCase = currentCase;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 按 UTC+8 取当日 YYYYMMDD */
export function todayDateKey(now = new Date()): string {
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  return `${cn.getUTCFullYear()}${pad(cn.getUTCMonth() + 1)}${pad(cn.getUTCDate())}`;
}

/**
 * 生成案件编号 INC-YYYYMMDD-XXX。
 * 策略：当日数量 + 1；唯一键冲突时仅重试一次。
 */
export async function allocateCaseNumber(now = new Date()): Promise<string> {
  const dateKey = todayDateKey(now);
  const prefix = `INC-${dateKey}-`;
  const count = await prisma.caseRecord.count({
    where: { caseNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

function indexFieldsFromState(input: {
  title: string;
  businessContext: CreateCaseInput["draft"]["businessContext"];
  identityContext: CreateCaseInput["draft"]["identityContext"];
  humanReview: CreateCaseInput["draft"]["humanReview"];
  checklist: CreateCaseInput["checklist"];
  suggestedRiskLevel: CreateCaseInput["suggestedRiskLevel"];
  status: CaseStatus;
}) {
  return {
    title: input.title,
    status: input.status,
    suggestedRiskLevel: input.suggestedRiskLevel,
    humanRiskLevel: input.humanReview?.humanRiskLevel ?? null,
    humanConclusion: input.humanReview?.finalConclusion ?? null,
    username: input.identityContext.accountName,
    sourceIp: input.identityContext.loginSourceIp,
    systemsSearchText: buildSystemsSearchText(
      input.identityContext.accessedSystems,
    ),
    pendingChecklistCount: countPendingChecklist(input.checklist),
    closedAt: input.status === "CLOSED" ? new Date() : null,
  };
}

function buildCreateRowData(input: CreateCaseInput, caseNumber: string) {
  const status: CaseStatus = input.status ?? "INVESTIGATING";
  const caseState = toPersistedCaseState({
    name: input.draft.name,
    createdAt: input.draft.createdAt,
    alert: input.draft.alert,
    dataContext: input.draft.dataContext,
    networkContext: input.draft.networkContext,
    identityContext: input.draft.identityContext,
    businessContext: input.draft.businessContext,
    checklist: input.checklist,
    humanReview: input.draft.humanReview,
    timeline: input.draft.timeline,
  });
  const indexes = indexFieldsFromState({
    title: input.draft.name,
    businessContext: input.draft.businessContext,
    identityContext: input.draft.identityContext,
    humanReview: input.draft.humanReview,
    checklist: input.checklist,
    suggestedRiskLevel: input.suggestedRiskLevel,
    status,
  });
  return {
    caseNumber,
    ...indexes,
    caseState: toJsonValue(caseState),
    hasReport: false,
    lastActivityAt: new Date(),
  };
}

/** 在指定 client（可事务）内创建 CaseRecord 行 */
export async function createCaseRecord(
  input: CreateCaseInput,
  client: CaseDbClient = prisma,
): Promise<PersistedCase> {
  let caseNumber = await allocateCaseNumber();
  try {
    const row = await client.caseRecord.create({
      data: buildCreateRowData(input, caseNumber),
    });
    return rowToPersistedCase(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Unique constraint") && !message.includes("UNIQUE")) {
      throw error;
    }
    caseNumber = await allocateCaseNumber();
    const row = await client.caseRecord.create({
      data: buildCreateRowData(input, caseNumber),
    });
    return rowToPersistedCase(row);
  }
}

/** 创建案件并持久化（无 Audit；语义创建请用 createCaseWithAudit） */
export async function createCase(
  input: CreateCaseInput,
): Promise<PersistedCase> {
  return createCaseRecord(input, prisma);
}

export async function getCaseById(
  id: string,
  client: CaseDbClient = prisma,
): Promise<PersistedCase | null> {
  const row = await client.caseRecord.findUnique({ where: { id } });
  return row ? rowToPersistedCase(row) : null;
}

export async function getCaseByCaseNumber(
  caseNumber: string,
): Promise<PersistedCase | null> {
  const row = await prisma.caseRecord.findUnique({ where: { caseNumber } });
  return row ? rowToPersistedCase(row) : null;
}

function buildCaseStateUpdateData(
  existing: {
    status: string;
    closedAt: Date | null;
  },
  input: SaveCaseStateInput,
) {
  const status: CaseStatus =
    input.status ?? (existing.status as CaseStatus);
  const caseState = toPersistedCaseState({
    name: input.caseData.name,
    createdAt: input.caseData.createdAt,
    alert: input.caseData.alert,
    dataContext: input.caseData.dataContext,
    networkContext: input.caseData.networkContext,
    identityContext: input.caseData.identityContext,
    businessContext: input.businessContext,
    checklist: input.checklist,
    humanReview: input.humanReview,
    timeline: input.timeline,
  });
  const indexes = indexFieldsFromState({
    title: input.caseData.name,
    businessContext: input.businessContext,
    identityContext: input.caseData.identityContext,
    humanReview: input.humanReview,
    checklist: input.checklist,
    suggestedRiskLevel: input.suggestedRiskLevel,
    status,
  });
  return {
    ...indexes,
    caseState: toJsonValue(caseState),
    // 已闭环时写入 closedAt；重新打开则清空
    closedAt:
      status === "CLOSED" ? (existing.closedAt ?? new Date()) : null,
  };
}

/**
 * 条件更新 caseState/status：仅当 updatedAt 仍等于 expectedUpdatedAt。
 * 必须在事务内与 Audit 同提交，避免 TOCTOU。
 */
export async function saveCaseStateIfVersionMatches(
  id: string,
  input: SaveCaseStateInput,
  expectedUpdatedAt: string,
  client: CaseDbClient = prisma,
): Promise<PersistedCase> {
  const expected = new Date(expectedUpdatedAt);
  if (!Number.isFinite(expected.getTime())) {
    throw new Error("baseUpdatedAt 无效");
  }

  const existing = await client.caseRecord.findUnique({ where: { id } });
  if (!existing) throw new Error(`案件不存在：${id}`);

  const data = buildCaseStateUpdateData(existing, input);
  const result = await client.caseRecord.updateMany({
    where: {
      id,
      updatedAt: expected,
    },
    data,
  });

  if (result.count !== 1) {
    const current = await getCaseById(id, client);
    throw new StaleCaseStateError(
      "案件已发生更新，已刷新到最新状态。",
      current,
    );
  }

  const row = await client.caseRecord.findUnique({ where: { id } });
  if (!row) throw new Error(`案件不存在：${id}`);
  return rowToPersistedCase(row);
}

/**
 * 保存案件可恢复状态（单一 caseState Source of Truth）。
 * 普通 autosave 路径：不更新 lastActivityAt。
 * 提供 baseUpdatedAt 时走条件更新（与 Semantic Command 共用版本约束）。
 * 可注入事务客户端，供 Semantic Command 与 Audit 同提交。
 */
export async function saveCaseState(
  id: string,
  input: SaveCaseStateInput,
  client: CaseDbClient = prisma,
): Promise<PersistedCase> {
  if (input.baseUpdatedAt) {
    return saveCaseStateIfVersionMatches(
      id,
      input,
      input.baseUpdatedAt,
      client,
    );
  }

  const existing = await client.caseRecord.findUnique({ where: { id } });
  if (!existing) throw new Error(`案件不存在：${id}`);

  const row = await client.caseRecord.update({
    where: { id },
    data: buildCaseStateUpdateData(existing, input),
  });
  return rowToPersistedCase(row);
}

/** stale report autosave：禁止用旧草稿覆盖较新 reportUpdatedAt */
export class StaleReportDraftError extends Error {
  readonly code = "STALE_REPORT" as const;
  constructor(message = "报告已在其他页面发生更新") {
    super(message);
    this.name = "StaleReportDraftError";
  }
}

/**
 * 保存人工报告草稿。
 * 一旦写入，恢复时不得用 buildReportData 覆盖。
 * 不更新 lastActivityAt（有意义的报告活动由 Audit Command 负责）。
 */
export async function saveReportDraft(
  id: string,
  reportDraft: ReportData,
  client: CaseDbClient = prisma,
  options?: { baseReportUpdatedAt?: string | null },
): Promise<PersistedCase> {
  const existing = await client.caseRecord.findUnique({ where: { id } });
  if (!existing) throw new Error(`案件不存在：${id}`);

  if (options?.baseReportUpdatedAt) {
    const baseMs = new Date(options.baseReportUpdatedAt).getTime();
    const currentMs = existing.reportUpdatedAt?.getTime() ?? 0;
    if (
      existing.reportUpdatedAt &&
      Number.isFinite(baseMs) &&
      Number.isFinite(currentMs) &&
      currentMs > baseMs
    ) {
      throw new StaleReportDraftError();
    }
  }

  const row = await client.caseRecord.update({
    where: { id },
    data: {
      reportDraft: toJsonValue(reportDraft),
      hasReport: true,
      reportUpdatedAt: new Date(),
    },
  });
  return rowToPersistedCase(row);
}

export async function listCases(
  query: ListCasesQuery = {},
): Promise<CaseListItem[]> {
  const where: {
    AND?: object[];
    status?: string;
  } = {};
  const and: object[] = [];

  if (query.status) {
    where.status = query.status;
  }
  if (query.riskLevel) {
    and.push({
      OR: [
        { humanRiskLevel: query.riskLevel },
        {
          AND: [
            { humanRiskLevel: null },
            { suggestedRiskLevel: query.riskLevel },
          ],
        },
      ],
    });
  }
  if (query.search?.trim()) {
    const q = query.search.trim();
    and.push({
      OR: [
        { caseNumber: { contains: q } },
        { title: { contains: q } },
        { username: { contains: q } },
        { sourceIp: { contains: q } },
        { systemsSearchText: { contains: q } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;

  const rows = await prisma.caseRecord.findMany({
    where,
    orderBy: [{ lastActivityAt: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(rowToListItem);
}

export async function listReportCases(): Promise<CaseListItem[]> {
  const rows = await prisma.caseRecord.findMany({
    where: { hasReport: true },
    orderBy: [{ reportUpdatedAt: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(rowToListItem);
}
