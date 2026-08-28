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
