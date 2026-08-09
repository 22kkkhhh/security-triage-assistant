/**
 * 开发/测试专用 Demo Users provisioning。
 * 必须通过 Better Auth Admin createUser；禁止手写 Account.password。
 * production（NODE_ENV=production）绝不运行。
 */

import type { UserRole } from "@/domain/auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type DemoUserSpec = {
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
};

export const DEMO_USER_SPECS: readonly DemoUserSpec[] = [
  {
    username: "demo-admin",
    email: "demo-admin@example.test",
    displayName: "演示管理员",
    role: "ADMIN",
  },
  {
    username: "demo-analyst",
    email: "demo-analyst@example.test",
    displayName: "演示分析员",
    role: "ANALYST",
  },
  {
    username: "demo-viewer",
    email: "demo-viewer@example.test",
    displayName: "演示只读用户",
    role: "VIEWER",
  },
] as const;

/** Development-only 默认口令；可用 DEMO_AUTH_PASSWORD 覆盖。禁止用于 production。 */
export function getDemoAuthPassword(): string {
  const fromEnv = process.env.DEMO_AUTH_PASSWORD?.trim();
  if (fromEnv && fromEnv.length >= 12) return fromEnv;
  return "DemoPass_ChangeMe_9x!";
}

export function isDemoProvisioningAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production";
}

export function assertDemoProvisioningAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (!isDemoProvisioningAllowed(nodeEnv)) {
    throw new Error("production 禁止 Demo User provisioning");
  }
}

/**
 * 幂等创建 Demo Users。已存在则跳过（不重置密码、不建第二个 Account）。
 */
export async function seedDemoUsers(): Promise<{
  created: string[];
  skipped: string[];
}> {
  assertDemoProvisioningAllowed();

  const password = getDemoAuthPassword();
  const created: string[] = [];
  const skipped: string[] = [];

  for (const spec of DEMO_USER_SPECS) {
    const existing = await prisma.user.findUnique({
      where: { username: spec.username },
    });
    if (existing) {
      skipped.push(spec.username);
      continue;
    }

    await auth.api.createUser({
      body: {
        email: spec.email,
        password,
        name: spec.displayName,
        role: spec.role,
        data: {
          username: spec.username,
        },
      },
    });
    created.push(spec.username);
  }

  return { created, skipped };
}
