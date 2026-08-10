/**
 * E2E-only test seam：仅用于在受控环境下强制 compliance resolver 进入既有
 * failure catch，以验证 UI fail-closed 展示（不得伪装为「真实零 findings」）。
 *
 * 硬安全要求（不可绕过）：
 * - seam 只能来自 server process env；不接受 URL query / pathname / header /
 *   cookie / body / Server Action 参数 / debug endpoint 触发。
 * - 必须同时满足全部条件才可能返回 true；任一条件不满足 → false。
 * - NODE_ENV 必须精确等于 "development"（而非仅「非 production」），
 *   因此 test / staging / undefined 均不会开启该 seam。
 * - DATABASE_URL 必须精确等于当前 E2E runner 使用的 e2e.db 路径，
 *   不做 includes("e2e") / basename 模糊匹配 / 任意 SQLite 文件放行。
 *
 * 本文件不得被扩展为可从 request 触发；调用方只允许
 * src/app/(app)/cases/loadCaseWorkbenchRuntime.ts 在既有 resolver catch 之前使用。
 */

const REQUIRED_NODE_ENV = "development";
const REQUIRED_E2E_HARNESS_VALUE = "1";
const REQUIRED_FORCE_FLAG_VALUE = "1";
const REQUIRED_DATABASE_URL = "file:./prisma/e2e.db";

export type E2EHarnessEnv = {
  NODE_ENV?: string;
  E2E_HARNESS?: string;
  E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE?: string;
  DATABASE_URL?: string;
};

/**
 * 仅当以下条件全部满足才返回 true：
 * 1. NODE_ENV === "development"（精确匹配，不是 NODE_ENV !== "production"）
 * 2. E2E_HARNESS === "1"
 * 3. E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE === "1"
 * 4. DATABASE_URL === "file:./prisma/e2e.db"（精确匹配当前 E2E runner 使用的 DB）
 *
 * production 环境下即使其余三个 flag 全部为真，本函数仍必须返回 false——
 * 这是代码本身保证，不依赖运维约定「生产不会配置这些变量」。
 */
export function shouldForceComplianceResolutionUnavailable(
  env: E2EHarnessEnv = process.env,
): boolean {
  return (
    env.NODE_ENV === REQUIRED_NODE_ENV &&
    env.E2E_HARNESS === REQUIRED_E2E_HARNESS_VALUE &&
    env.E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE ===
      REQUIRED_FORCE_FLAG_VALUE &&
    env.DATABASE_URL === REQUIRED_DATABASE_URL
  );
}
