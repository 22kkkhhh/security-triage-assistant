/**
 * CaseAuditLog 持久化：append / 分页查询 / 最新交接。
 * 业务语义操作应通过 Prisma transaction 与状态修改同提交。
 */

import { prisma } from "@/lib/prisma";
import { Prisma, type Prisma as PrismaTypes } from "@/generated/prisma/client";
import {
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_MAX_LIMIT,
  isAuditActionType,
  isAuditActorType,
  type AuditActionType,
  type AuditActorType,
} from "@/domain/audit";
import type { BuiltAuditEvent } from "@/services/audit/auditEventBuilder";

/** 可注入事务客户端，便于业务命令与 Audit 同事务 */
export type AuditDbClient = PrismaTypes.TransactionClient | typeof prisma;

export interface CaseAuditLogView {
  id: string;
  caseId: string;
  actionType: AuditActionType;
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  operationId: string | null;
  createdAt: string;
}

export interface ListCaseAuditLogsQuery {
  caseId: string;
  /** 上一页最后一条的 id（cursor 分页） */
  cursor?: string | null;
  /** 默认 40，上限 100 */
  limit?: number;
}

export interface ListCaseAuditLogsResult {
  items: CaseAuditLogView[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AppendCaseAuditInput extends BuiltAuditEvent {
  caseId: string;
}

function toJsonOrDbNull(
  value: Record<string, unknown> | null,
): PrismaTypes.InputJsonValue | typeof Prisma.DbNull {
  if (value == null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;
}

function rowToView(row: {
  id: string;
  caseId: string;
  actionType: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  summary: string;
  changes: unknown;
  metadata: unknown;
  operationId: string | null;
  createdAt: Date;
}): CaseAuditLogView {
  if (!isAuditActionType(row.actionType)) {
    throw new Error(`未知 AuditActionType: ${row.actionType}`);
  }
  if (!isAuditActorType(row.actorType)) {
    throw new Error(`未知 AuditActorType: ${row.actorType}`);
  }
  return {
    id: row.id,
    caseId: row.caseId,
    actionType: row.actionType,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName: row.actorName,
    summary: row.summary,
    changes:
      row.changes && typeof row.changes === "object"
        ? (row.changes as Record<string, unknown>)
        : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    operationId: row.operationId,
    createdAt: row.createdAt.toISOString(),
  };
}

function resolveLimit(limit?: number): number {
  const n = limit ?? AUDIT_LOG_DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return AUDIT_LOG_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), AUDIT_LOG_MAX_LIMIT);
}

/** 在事务中执行业务 + Audit（Step 2+ 语义命令使用） */
export async function runInTransaction<T>(
  fn: (tx: PrismaTypes.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}

/**
 * 仅写入一条 AuditLog（不更新 lastActivityAt）。
 * 优先使用 appendCaseAudit（同事务触摸活动时间）。
 */
export async function appendAuditLog(
  input: AppendCaseAuditInput,
  client: AuditDbClient = prisma,
): Promise<CaseAuditLogView> {
  const row = await client.caseAuditLog.create({
    data: {
      caseId: input.caseId,
      actionType: input.actionType,
      actorType: input.actorType,
      actorId: input.actorId,
      actorName: input.actorName,
      summary: input.summary,
      changes: toJsonOrDbNull(input.changes),
      metadata: toJsonOrDbNull(input.metadata),
      operationId: input.operationId ?? null,
    },
  });
  return rowToView(row);
}

/** 更新案件 lastActivityAt（不改 caseState） */
export async function touchCaseLastActivity(
  caseId: string,
  client: AuditDbClient = prisma,
  at: Date = new Date(),
): Promise<void> {
  await client.caseRecord.update({
    where: { id: caseId },
    data: { lastActivityAt: at },
  });
}

/**
 * 写入 Audit 并更新 lastActivityAt。
 * - 若传入 tx：参与外层事务（业务修改 + Audit 同提交）
 * - 若未传：内部开启事务，保证二者同成功/同失败
 */
export async function appendCaseAudit(
  input: AppendCaseAuditInput,
  tx?: PrismaTypes.TransactionClient,
): Promise<CaseAuditLogView> {
  const run = async (client: AuditDbClient) => {
    const view = await appendAuditLog(input, client);
    await touchCaseLastActivity(input.caseId, client);
    return view;
  };

  if (tx) return run(tx);
  return prisma.$transaction((inner) => run(inner));
}

/**
 * 分页列出案件审计（createdAt DESC，最新在上）。
 * cursor = 上一页最后一条 id。
 */
export async function listCaseAuditLogs(
  query: ListCaseAuditLogsQuery,
): Promise<ListCaseAuditLogsResult> {
  const take = resolveLimit(query.limit);
  const rows = await prisma.caseAuditLog.findMany({
    where: { caseId: query.caseId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(query.cursor
      ? { cursor: { id: query.cursor }, skip: 1 }
      : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const items = page.map(rowToView);
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return { items, nextCursor, hasMore };
}

/** 最新一条交接说明（由 HANDOFF_NOTE_ADDED 派生；无则 null） */
export async function getLatestHandoffNote(
  caseId: string,
): Promise<CaseAuditLogView | null> {
  const row = await prisma.caseAuditLog.findFirst({
    where: { caseId, actionType: "HANDOFF_NOTE_ADDED" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? rowToView(row) : null;
}

/** 按 operationId 查找（幂等） */
export async function findAuditByOperationId(
  operationId: string,
): Promise<CaseAuditLogView | null> {
  const row = await prisma.caseAuditLog.findUnique({
    where: { operationId },
  });
  return row ? rowToView(row) : null;
}
