/**
 * Consistent SQLite backup via VACUUM INTO (official SQLite snapshot mechanism).
 * Uses Prisma + @prisma/adapter-better-sqlite3 — no undeclared better-sqlite3 import.
 */

import fs from "node:fs";
import path from "node:path";
import {
  assertProductionSqliteDatabaseUrl,
  resolveDatabaseUrl,
  resolveSqliteDatabaseFilePaths,
} from "@/lib/envConfig";
import { logOperationalEvent } from "@/services/runtime/operationalLogger";
import {
  pragmaIntegrityCheck,
  quoteSqlitePathLiteral,
  withSqliteAdminClient,
} from "@/services/runtime/sqliteAdminClient";

export type BackupSqliteOptions = {
  databaseUrl?: string;
  outputPath?: string;
  outputDir?: string;
  projectRoot?: string;
  clock?: () => Date;
  fsImpl?: typeof fs;
};

export type BackupSqliteResult = {
  outputPath: string;
  sizeBytes: number;
  integrity: "ok";
};

function formatBackupFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `security-triage-${stamp}.db`;
}

function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:${normalized}`;
  }
  return `file:${normalized}`;
}

export async function backupSqliteDatabase(
  options: BackupSqliteOptions = {},
): Promise<BackupSqliteResult> {
  logOperationalEvent({
    level: "info",
    event: "backup_begin",
    component: "backup",
    status: "ok",
  });

  const fsImpl = options.fsImpl ?? fs;
  const databaseUrl = assertProductionSqliteDatabaseUrl(
    resolveDatabaseUrl({
      databaseUrl: options.databaseUrl,
      nodeEnv: "production",
    }),
  );

  const { dbFilePath } = resolveSqliteDatabaseFilePaths({
    databaseUrl,
    nodeEnv: "production",
    projectRoot: options.projectRoot,
  });

  if (!fsImpl.existsSync(dbFilePath)) {
    logOperationalEvent({
      level: "error",
      event: "backup_failed",
      component: "backup",
      status: "failed",
      reason: "source_missing",
    });
    throw new Error("backup failed: source database file does not exist");
  }

  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.resolve(
        options.outputDir ?? path.dirname(dbFilePath),
        formatBackupFilename(options.clock?.() ?? new Date()),
      );

  if (path.resolve(outputPath) === path.resolve(dbFilePath)) {
    logOperationalEvent({
      level: "error",
      event: "backup_failed",
      component: "backup",
      status: "failed",
      reason: "same_path",
    });
    throw new Error("backup failed: output path must differ from source database");
  }

  const parent = path.dirname(outputPath);
  if (!fsImpl.existsSync(parent)) {
    try {
      fsImpl.mkdirSync(parent, { recursive: true });
    } catch {
      logOperationalEvent({
        level: "error",
        event: "backup_failed",
        component: "backup",
        status: "failed",
        reason: "target_unwritable",
      });
      throw new Error("backup failed: output directory cannot be created");
    }
  }

  const tmpPath = `${outputPath}.tmp`;
  try {
    if (fsImpl.existsSync(tmpPath)) fsImpl.unlinkSync(tmpPath);
    if (fsImpl.existsSync(outputPath)) fsImpl.unlinkSync(outputPath);
  } catch {
    logOperationalEvent({
      level: "error",
      event: "backup_failed",
      component: "backup",
      status: "failed",
      reason: "target_unwritable",
    });
    throw new Error("backup failed: cannot prepare output path");
  }

  try {
    await withSqliteAdminClient(databaseUrl, async (client) => {
      const integrity = await pragmaIntegrityCheck(client);
      if (integrity !== "ok") {
        throw new Error("backup failed: source integrity check failed");
      }
      await client.$executeRawUnsafe(
        `VACUUM INTO ${quoteSqlitePathLiteral(tmpPath)}`,
      );
    });

    await withSqliteAdminClient(toFileUrl(tmpPath), async (client) => {
      const integrity = await pragmaIntegrityCheck(client);
      if (integrity !== "ok") {
        throw new Error("backup failed: backup integrity check failed");
      }
    });

    fsImpl.renameSync(tmpPath, outputPath);
    const sizeBytes = fsImpl.statSync(outputPath).size;

    logOperationalEvent({
      level: "info",
      event: "backup_success",
      component: "backup",
      status: "ok",
    });

    return { outputPath, sizeBytes, integrity: "ok" };
  } catch (error) {
    try {
      if (fsImpl.existsSync(tmpPath)) fsImpl.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup
    }
    if (
      error instanceof Error &&
      error.message.startsWith("backup failed:")
    ) {
      logOperationalEvent({
        level: "error",
        event: "backup_failed",
        component: "backup",
        status: "failed",
        reason: "integrity_or_vacuum",
      });
      throw error;
    }
    logOperationalEvent({
      level: "error",
      event: "backup_failed",
      component: "backup",
      status: "failed",
      reason: "vacuum_failed",
    });
    throw new Error("backup failed: consistent snapshot could not be created");
  }
}
