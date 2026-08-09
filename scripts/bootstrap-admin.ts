/**
 * Production / fresh instance：一次性创建首个 enabled ADMIN。
 * 禁止 app startup 自动调用；禁止默认弱口令。
 *
 * 环境变量（全部必填）：
 *   BOOTSTRAP_ADMIN_USERNAME
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_DISPLAY_NAME
 *   BOOTSTRAP_ADMIN_PASSWORD
 */
import "dotenv/config";
import { UserAdminError } from "../src/domain/userAdminErrors";
import { prisma } from "../src/lib/prisma";
import {
  bootstrapAdmin,
  parseBootstrapEnv,
} from "../src/services/auth/bootstrapAdmin";

async function main() {
  const input = parseBootstrapEnv();
  const created = await bootstrapAdmin(input);
  console.log(
    JSON.stringify({
      ok: true,
      username: created.username,
      email: created.email,
      role: created.role,
      enabled: created.enabled,
      message: "首个管理员已创建。请妥善保管口令，勿写入仓库。",
    }),
  );
}

main()
  .catch((error) => {
    const code =
      error instanceof UserAdminError ? error.code : "BOOTSTRAP_FAILED";
    const message =
      error instanceof Error ? error.message : "bootstrap 失败";
    console.error(JSON.stringify({ ok: false, code, message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
