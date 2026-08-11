/**
 * Operator CLI: consistent SQLite backup (VACUUM INTO + integrity_check).
 *
 * Usage:
 *   npm run db:backup -- --output ./backups/manual.db
 *   BACKUP_DIR=./backups npm run db:backup
 */
import "dotenv/config";
import path from "node:path";
import { assertProductionSqliteDatabaseUrl } from "../src/lib/envConfig";
import { backupSqliteDatabase } from "../src/services/runtime/sqliteBackup";

function parseArgs(argv: string[]): { output?: string; outputDir?: string } {
  const out: { output?: string; outputDir?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output" || arg === "-o") {
      out.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--output-dir") {
      out.outputDir = argv[i + 1];
      i += 1;
    }
  }
  if (!out.outputDir && process.env.BACKUP_DIR?.trim()) {
    out.outputDir = process.env.BACKUP_DIR.trim();
  }
  return out;
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
        message: "backup failed: DATABASE_URL must be a SQLite file: URL",
      }),
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await backupSqliteDatabase({
      databaseUrl: url,
      outputPath: args.output ? path.resolve(args.output) : undefined,
      outputDir: args.outputDir ? path.resolve(args.outputDir) : undefined,
    });
    console.log(
      JSON.stringify({
        ok: true,
        message: "backup created",
        filename: path.basename(result.outputPath),
        outputPath: result.outputPath,
        sizeBytes: result.sizeBytes,
        integrity: result.integrity,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "backup failed";
    console.error(JSON.stringify({ ok: false, message }));
    process.exitCode = 1;
  }
}

main();
