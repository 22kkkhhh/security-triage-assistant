/**
 * Operator CLI: destructive SQLite restore.
 *
 * Usage:
 *   npm run db:restore -- --backup ./backups/x.db --confirm-restore
 *   npm run db:restore -- --backup ./backups/x.db --confirm-restore --skip-safety-backup
 *
 * Stop the application / container before restore.
 */
import "dotenv/config";
import path from "node:path";
import { assertProductionSqliteDatabaseUrl } from "../src/lib/envConfig";
import { restoreSqliteDatabase } from "../src/services/runtime/sqliteRestore";

function parseArgs(argv: string[]): {
  backup?: string;
  confirmRestore: boolean;
  skipSafetyBackup: boolean;
} {
  let backup: string | undefined;
  let confirmRestore = false;
  let skipSafetyBackup = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--backup" || arg === "-b") {
      backup = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--confirm-restore") {
      confirmRestore = true;
      continue;
    }
    if (arg === "--skip-safety-backup") {
      skipSafetyBackup = true;
    }
  }
  return { backup, confirmRestore, skipSafetyBackup };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let url: string;
  try {
    const raw = process.env.DATABASE_URL?.trim();
    if (!raw) throw new Error("DATABASE_URL is required");
    url = assertProductionSqliteDatabaseUrl(raw);
  } catch {
    console.error(
      JSON.stringify({
        ok: false,
        message: "restore failed: DATABASE_URL must be a SQLite file: URL",
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (!args.backup) {
    console.error(
      JSON.stringify({
        ok: false,
        message: "restore failed: --backup <path> is required",
      }),
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await restoreSqliteDatabase({
      databaseUrl: url,
      backupPath: path.resolve(args.backup),
      confirmRestore: args.confirmRestore,
      skipSafetyBackup: args.skipSafetyBackup,
    });
    console.log(
      JSON.stringify({
        ok: true,
        message: "restore completed",
        restoredPath: result.restoredPath,
        safetyBackupPath: result.safetyBackupPath,
        integrity: result.integrity,
        note: "start the application with npm start; migrate gate will forward-migrate if needed",
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "restore failed";
    console.error(JSON.stringify({ ok: false, message }));
    process.exitCode = 1;
  }
}

main();
