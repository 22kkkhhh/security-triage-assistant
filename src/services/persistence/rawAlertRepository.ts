import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type RawAlertIngestStatus = "RECEIVED" | "CREATED" | "DUPLICATE" | "REJECTED";

export async function createRawAlertRecord(input: {
  sourceType: string;
  externalAlertId?: string | null;
  payloadJson: unknown;
  payloadHash: string;
}): Promise<{ id: string }> {
  const row = await prisma.rawAlertRecord.create({
    data: {
      sourceType: input.sourceType,
      externalAlertId: input.externalAlertId?.trim() || null,
      payloadJson: input.payloadJson as Prisma.InputJsonValue,
      payloadHash: input.payloadHash,
      ingestStatus: "RECEIVED",
    },
    select: { id: true },
  });
  return row;
}

export async function updateRawAlertIngestResult(input: {
  id: string;
  status: RawAlertIngestStatus;
  caseId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.rawAlertRecord.update({
    where: { id: input.id },
    data: {
      ingestStatus: input.status,
      caseId: input.caseId ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

export async function queryRawAlertRecords(input: {
  sourceType?: string;
  ingestStatus?: RawAlertIngestStatus;
  externalAlertId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 25)));
  const where: Prisma.RawAlertRecordWhereInput = {
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.ingestStatus ? { ingestStatus: input.ingestStatus } : {}),
    ...(input.externalAlertId ? { externalAlertId: { contains: input.externalAlertId.slice(0, 120) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.rawAlertRecord.count({ where }),
    prisma.rawAlertRecord.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, sourceType: true, externalAlertId: true, receivedAt: true, ingestStatus: true, caseId: true, errorMessage: true, payloadHash: true, redactionVersion: true },
    }),
  ]);
  return { page, pageSize, total, rows };
}

/**
 * Returns the already-redacted payload for an authorized detail view.
 * RawAlertRecord.payloadJson is written only after recursive redaction at ingest.
 */
export async function getRawAlertRecordDetail(id: string) {
  return prisma.rawAlertRecord.findUnique({
    where: { id },
    select: {
      id: true,
      sourceType: true,
      externalAlertId: true,
      receivedAt: true,
      ingestStatus: true,
      caseId: true,
      errorMessage: true,
      payloadJson: true,
      payloadHash: true,
      redactionVersion: true,
    },
  });
}
