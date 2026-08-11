/**
 * Destructive SQLite restore. Requires explicit --confirm-restore.
 * Operator must stop the application first. Uses file replace + sidecar cleanup.
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
  withSqliteAdminClient,
} from "@/services/runtime/sqliteAdminClient";
import { backupSqliteDatabase } from "@/services/runtime/sqliteBackup";

export type RestoreSqliteOptions = {
  databaseUrl?: string;
  backupPath: string;
  confirmRestore: boolean;
  skipSafetyBackup?: boolean;
  projectRoot?: string;
  safetyBackupDir?: string;
  clock?: () => Date;
  fsImpl?: typeof fs;
};

export type RestoreSqliteResult = {
  restoredPath: string;
  safetyBackupPath: string | null;
  integrity: "ok";
};

function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  return `file:${normalized}`;
}

async function assertBackupReadableAndCompatible(
  backupPath: string,
): Promise<void> {
  await withSqliteAdminClient(toFileUrl(backupPath), async (client) => {
    const integrity = await pragmaIntegrityCheck(client);
    if (integrity !== "ok") {
      throw new Error("restore failed: backup integrity check failed");
    }

    const tables = await client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('_prisma_migrations','CaseRecord','user')`,
    );
    const names = new Set(tables.map((t) => t.name));
    if (!names.has("_prisma_migrations") || !names.has("CaseRecord")) {
      throw new Error("restore failed: backup is missing required schema tables");
    }
  });
}

async function assertSqliteFileIntegrity(dbPath: string): Promise<void> {
  await withSqliteAdminClient(toFileUrl(dbPath), async (client) => {
    const integrity = await pragmaIntegrityCheck(client);
    if (integrity !== "ok") {
      throw new Error("restore failed: staging database integrity check failed");
    }
  });
}

/**
 * Best-effort busy probe only — cannot prove the application is stopped on every OS.
 * Operator MUST stop the application / container before restore.
 */
function assertNotBusy(livePath: string, fsImpl: typeof fs): void {
  if (!fsImpl.existsSync(livePath)) return;
  const probe = `${livePath}.replace-probe-${process.pid}`;
  try {
    fsImpl.renameSync(livePath, probe);
    fsImpl.renameSync(probe, livePath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new Error(
        "restore failed: database appears in use — stop the application first",
      );
    }
    throw new Error("restore failed: cannot replace live database file");
  }
}

/**
 * Clear stale SQLite sidecars before replacing the live DB.
 * Missing sidecars are OK. Any unlink failure fails closed.
 */
function clearStaleSidecars(
  sidecarPaths: readonly string[],
  livePath: string,
  fsImpl: typeof fs,
): void {
  for (const sidecar of sidecarPaths) {
    if (sidecar === livePath) continue;
    if (!fsImpl.existsSync(sidecar)) continue;
    try {
      fsImpl.unlinkSync(sidecar);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      // Race: file disappeared between exists and unlink — treat as cleared.
      if (code === "ENOENT") continue;
      throw new Error(
        "restore failed: failed to clear SQLite sidecar; ensure application is stopped",
      );
    }
  }
}

export async function restoreSqliteDatabase(
  options: RestoreSqliteOptions,
): Promise<RestoreSqliteResult> {
  logOperationalEvent({
    level: "info",
    event: "restore_begin",
    component: "restore",
    status: "ok",
  });

  if (!options.confirmRestore) {
    logOperationalEvent({
      level: "error",
      event: "restore_failed",
      component: "restore",
      status: "failed",
      reason: "confirm_required",
    });
    throw new Error("restore failed: --confirm-restore is required");
  }

  const fsImpl = options.fsImpl ?? fs;
  const backupPath = path.resolve(options.backupPath);
  if (!fsImpl.existsSync(backupPath)) {
    logOperationalEvent({
      level: "error",
      event: "restore_failed",
      component: "restore",
      status: "failed",
      reason: "backup_missing",
    });
    throw new Error("restore failed: backup file does not exist");
  }

  // Reject obvious non-SQLite garbage before touching live DB.
  const header = Buffer.alloc(16);
  const fd = fsImpl.openSync(backupPath, "r");
  try {
    fsImpl.readSync(fd, header, 0, 16, 0);
  } finally {
    fsImpl.closeSync(fd);
  }
  if (!header.toString("utf8").startsWith("SQLite format 3")) {
    logOperationalEvent({
      level: "error",
      event: "restore_failed",
      component: "restore",
      status: "failed",
      reason: "corrupt_backup",
    });
    throw new Error("restore failed: backup is not a valid SQLite database");
  }

  try {
    await assertBackupReadableAndCompatible(backupPath);
  } catch (error) {
    logOperationalEvent({
      level: "error",
      event: "restore_failed",
      component: "restore",
      status: "failed",
      reason: "corrupt_backup",
    });
    throw error instanceof Error
      ? error
      : new Error("restore failed: backup validation failed");
  }

  const databaseUrl = assertProductionSqliteDatabaseUrl(
    resolveDatabaseUrl({
      databaseUrl: options.databaseUrl,
      nodeEnv: "production",
    }),
  );
  const resolved = resolveSqliteDatabaseFilePaths({
    databaseUrl,
    nodeEnv: "production",
    projectRoot: options.projectRoot,
  });
  const livePath = resolved.dbFilePath;

  if (path.resolve(backupPath) === path.resolve(livePath)) {
    logOperationalEvent({
      level: "error",
      event: "restore_failed",
      component: "restore",
      status: "failed",
      reason: "same_path",
    });
    throw new Error("restore failed: backup path must differ from live database");
  }

  // Best-effort only — not a process detector.
  assertNotBusy(livePath, fsImpl);

  let safetyBackupPath: string | null = null;
  if (fsImpl.existsSync(livePath) && !options.skipSafetyBackup) {
    const safetyDir =
      options.safetyBackupDir ??
      path.join(path.dirname(livePath), "pre-restore-safety");
    const result = await backupSqliteDatabase({
      databaseUrl,
      outputDir: safetyDir,
      projectRoot: options.projectRoot,
      clock: options.clock,
      fsImpl,
    });
    safetyBackupPath = result.outputPath;
  }

  const parent = path.dirname(livePath);
  if (!fsImpl.existsSync(parent)) {
    fsImpl.mkdirSync(parent, { recursive: true });
  }

  const stagingPath = path.join(
    parent,
    `.restore-staging-${process.pid}-${Date.now()}.db`,
  );

  try {
    fsImpl.copyFileSync(backupPath, stagingPath);
    await assertSqliteFileIntegrity(stagingPath);

    // Fail closed BEFORE replacing live DB if stale sidecars cannot be cleared.
    try {
      clearStaleSidecars(resolved.sidecarPaths, livePath, fsImpl);
    } catch (error) {
      logOperationalEvent({
        level: "error",
        event: "restore_failed",
        component: "restore",
        status: "failed",
        reason: "sidecar_cleanup_failed",
      });
      throw error;
    }

    // Replace live only after staging verified and sidecars cleared.
    if (fsImpl.existsSync(livePath)) {
      const retired = `${livePath}.retired-${Date.now()}`;
      fsImpl.renameSync(livePath, retired);
      try {
        fsImpl.renameSync(stagingPath, livePath);
        fsImpl.unlinkSync(retired);
      } catch (error) {
        // Attempt to put retired DB back if replace failed.
        try {
          if (!fsImpl.existsSync(livePath) && fsImpl.existsSync(retired)) {
            fsImpl.renameSync(retired, livePath);
          }
        } catch {
          // ignore recovery secondary errors
        }
        throw error;
      }
    } else {
      fsImpl.renameSync(stagingPath, livePath);
    }

    await withSqliteAdminClient(toFileUrl(livePath), async (client) => {
      const integrity = await pragmaIntegrityCheck(client);
      if (integrity !== "ok") {
        throw new Error("restore failed: restored database integrity check failed");
      }
    });

    logOperationalEvent({
      level: "info",
      event: "restore_success",
      component: "restore",
      status: "ok",
    });

    return {
      restoredPath: livePath,
      safetyBackupPath,
      integrity: "ok",
    };
  } catch (error) {
    try {
      if (fsImpl.existsSync(stagingPath)) fsImpl.unlinkSync(stagingPath);
    } catch {
      // ignore staging cleanup
    }
    if (
      !(
        error instanceof Error &&
        error.message.includes("failed to clear SQLite sidecar")
      )
    ) {
      logOperationalEvent({
        level: "error",
        event: "restore_failed",
        component: "restore",
        status: "failed",
        reason: "replace_failed",
      });
    }
    if (error instanceof Error && error.message.startsWith("restore failed:")) {
      throw error;
    }
    throw new Error("restore failed: could not replace live database safely");
  }
}
