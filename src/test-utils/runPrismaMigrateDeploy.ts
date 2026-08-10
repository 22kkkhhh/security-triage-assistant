import { spawnSync } from "node:child_process";

type RunPrismaMigrateDeployOptions = {
  databaseUrl: string;
  cwd?: string;
};

/**
 * DB 集成测试的统一 migration bootstrap。
 *
 * Windows 不能通过 execSync 的隐式 shell 路径启动 Prisma Schema Engine；
 * 明确使用已经验证的 cmd.exe + spawnSync 路径。其他平台保持 npx 参数调用。
 */
export function runPrismaMigrateDeploy({
  databaseUrl,
  cwd = process.cwd(),
}: RunPrismaMigrateDeployOptions): void {
  const isWindows = process.platform === "win32";
  const command = isWindows ? process.env.ComSpec || "cmd.exe" : "npx";
  const args = isWindows
    ? ["/d", "/s", "/c", "npx prisma migrate deploy"]
    : ["prisma", "migrate", "deploy"];
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });

  if (!result.error && result.status === 0) return;

  const details = [
    "Prisma migrate deploy failed during test bootstrap.",
    `command: ${command} ${args.join(" ")}`,
    `cwd: ${cwd}`,
    `exit status: ${result.status ?? "null"}`,
    `spawn error: ${result.error?.message ?? "none"}`,
    "stdout:",
    result.stdout ?? "",
    "stderr:",
    result.stderr ?? "",
  ].join("\n");
  throw new Error(details, { cause: result.error });
}
