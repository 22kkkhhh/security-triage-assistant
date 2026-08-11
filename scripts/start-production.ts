/**
 * Production entry: env validation → SQLite preflight → prisma migrate deploy
 * → readiness probe → next start.
 *
 * Invoked by `npm start`. Does not run migrations inside instrumentation.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProductionStartGate } from "../src/services/runtime/productionStartGate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveCommand(command: string): string {
  if (process.platform === "win32" && command === "npx") return "npx.cmd";
  return command;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "inherit", "pipe"],
      shell: false,
      windowsHide: true,
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      const redacted = text
        .replace(/BETTER_AUTH_SECRET\s*=\s*\S+/gi, "BETTER_AUTH_SECRET=***")
        .replace(/DATABASE_URL\s*=\s*\S+/gi, "DATABASE_URL=***")
        .replace(/file:[^\s)'"]+/gi, "file:***");
      process.stderr.write(redacted);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`command_failed:${command}`));
    });
  });
}

function startNextProcess(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand("npx"), ["next", "start"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function ensureProductionNodeEnv(): void {
  if (process.env.NODE_ENV === "production") return;
  // process.env.NODE_ENV is typed read-only; runtime still needs production for the gate.
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "production",
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

async function main(): Promise<void> {
  ensureProductionNodeEnv();

  const result = await runProductionStartGate({
    env: process.env,
    migrateDeploy: async () => {
      await runCommand("npx", ["prisma", "migrate", "deploy"]);
    },
    checkReadiness: async () => {
      // Lazy-load Prisma only after migrate so first-deploy creates schema first.
      const { resetPrismaClient } = await import("../src/lib/prisma");
      const { checkApplicationReadiness } = await import(
        "../src/services/runtime/readiness"
      );
      await resetPrismaClient(process.env.DATABASE_URL);
      return checkApplicationReadiness();
    },
    startNext: () => startNextProcess(),
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

main().catch(() => {
  console.error("production start failed");
  process.exitCode = 1;
});
