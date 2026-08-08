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

/** Domain 对象 → Prisma Json 字段（结构化克隆，去掉不可序列化内容） */
function toJsonValue(value: PersistedCaseState | ReportData): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

/** 创建案件并持久化；返回领域视图 */
export async function createCase(
  input: CreateCaseInput,
): Promise<PersistedCase> {
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

  let caseNumber = await allocateCaseNumber();
  try {
    const row = await prisma.caseRecord.create({
      data: {
        caseNumber,
        ...indexes,
        caseState: toJsonValue(caseState),
        hasReport: false,
      },
    });
    return rowToPersistedCase(row);
  } catch (error) {
    // 唯一键冲突：重新计算编号后重试一次
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Unique constraint") && !message.includes("UNIQUE")) {
      throw error;
    }
    caseNumber = await allocateCaseNumber();
    const row = await prisma.caseRecord.create({
      data: {
        caseNumber,
        ...indexes,
        caseState: toJsonValue(caseState),
        hasReport: false,
      },
    });
    return rowToPersistedCase(row);
  }
}

export async function getCaseById(id: string): Promise<PersistedCase | null> {
  const row = await prisma.caseRecord.findUnique({ where: { id } });
  return row ? rowToPersistedCase(row) : null;
}

export async function getCaseByCaseNumber(
  caseNumber: string,
): Promise<PersistedCase | null> {
  const row = await prisma.caseRecord.findUnique({ where: { caseNumber } });
  return row ? rowToPersistedCase(row) : null;
}

/** 保存案件可恢复状态（单一 caseState Source of Truth） */
export async function saveCaseState(
  id: string,
  input: SaveCaseStateInput,
): Promise<PersistedCase> {
  const existing = await prisma.caseRecord.findUnique({ where: { id } });
  if (!existing) throw new Error(`案件不存在：${id}`);

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

  const row = await prisma.caseRecord.update({
    where: { id },
    data: {
      ...indexes,
      caseState: toJsonValue(caseState),
      // 已闭环时写入 closedAt；重新打开则清空
      closedAt:
        status === "CLOSED"
          ? existing.closedAt ?? new Date()
          : null,
    },
  });
  return rowToPersistedCase(row);
}

/**
 * 保存人工报告草稿。
 * 一旦写入，恢复时不得用 buildReportData 覆盖。
 */
export async function saveReportDraft(
  id: string,
  reportDraft: ReportData,
): Promise<PersistedCase> {
  const row = await prisma.caseRecord.update({
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
    orderBy: { updatedAt: "desc" },
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
