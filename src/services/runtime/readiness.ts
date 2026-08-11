/**
 * Application readiness probe — shared by production start gate and GET /api/ready.
 * Side-effect free beyond a single read query that references v1.11 critical columns.
 */

import { prisma } from "@/lib/prisma";

export type ReadinessCheckResult =
  | { ready: true }
  | { ready: false; category: ReadinessFailureCategory };

export type ReadinessFailureCategory =
  | "database_unavailable"
  | "schema_not_ready"
  | "unknown";

export type ReadinessProbeClient = {
  caseRecord: {
    findFirst: (args: {
      select: { id: true; assignedToUserId: true; dueAt: true };
    }) => Promise<unknown>;
  };
};

function categorizeReadinessError(error: unknown): ReadinessFailureCategory {
  if (!error || typeof error !== "object") return "unknown";
  const code =
    "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  // Prisma P2022 = column does not exist (stale / unmigrated schema)
  if (code === "P2022") return "schema_not_ready";
  if (code === "P1001" || code === "P1003" || code === "P1017") {
    return "database_unavailable";
  }
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes("does not exist") ||
    message.includes("no such column") ||
    message.includes("columnnotfound")
  ) {
    return "schema_not_ready";
  }
  if (
    message.includes("unable to open") ||
    message.includes("econnrefused") ||
    message.includes("database")
  ) {
    return "database_unavailable";
  }
  return "unknown";
}

/**
 * Probe DB connectivity and critical CaseRecord schema (id / assignedToUserId / dueAt).
 * Never throws — always returns a structured result.
 */
export async function checkApplicationReadiness(
  client: ReadinessProbeClient = prisma,
): Promise<ReadinessCheckResult> {
  try {
    await client.caseRecord.findFirst({
      select: {
        id: true,
        assignedToUserId: true,
        dueAt: true,
      },
    });
    return { ready: true };
  } catch (error) {
    return { ready: false, category: categorizeReadinessError(error) };
  }
}

/** Sanitized operational message for stderr / start gate (no SQL / paths / Prisma codes). */
export function formatReadinessFailureMessage(
  category: ReadinessFailureCategory,
): string {
  switch (category) {
    case "schema_not_ready":
      return "readiness failed: database schema is not ready";
    case "database_unavailable":
      return "readiness failed: database is unavailable";
    default:
      return "readiness failed: application is not ready";
  }
}
