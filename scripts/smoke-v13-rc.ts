/**
 * v1.3 轻量 HTTP smoke（三角色页面边界 + 读路径无突变指纹）。
 * 不新增 Playwright；依赖本地已启动的 app（dev 或 next start）。
 */
import { getDemoAuthPassword } from "../src/services/demo/seedDemoUsers";
import { prisma, resetPrismaClient } from "../src/lib/prisma";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const password = getDemoAuthPassword();

async function signIn(username: string) {
  const res = await fetch(`${base}/api/auth/sign-in/username`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  let cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) {
    const raw = res.headers.get("set-cookie");
    if (raw) {
      cookie = raw
        .split(/,(?=[^;]+?=)/)
        .map((c) => c.split(";")[0]!.trim())
        .join("; ");
    }
  }
  if (!res.ok || !cookie) {
    throw new Error(`${username} 登录失败 status=${res.status}`);
  }
  return cookie;
}

async function getPage(path: string, cookie: string) {
  const res = await fetch(`${base}${path}`, {
    headers: { cookie },
    redirect: "manual",
  });
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get("location"),
    text,
    // 仅识别 ForbiddenPanel；勿把 Export「当前账号无权限导出」误判为页面 Forbidden
    forbidden:
      text.includes("无权访问") ||
      text.includes("无权新建") ||
      text.includes("无权修改") ||
      text.includes("当前账号无权限查看") ||
      text.includes("当前账号无权限创建") ||
      text.includes("当前账号无权限管理"),
    createUser: text.includes("创建用户"),
    changePassword: text.includes("修改密码"),
    newCase: text.includes("新建研判") || text.includes("+ 新建研判"),
  };
}

async function fingerprintCase(caseId: string) {
  const row = await prisma.caseRecord.findUniqueOrThrow({ where: { id: caseId } });
  const audits = await prisma.caseAuditLog.count({ where: { caseId } });
  return {
    updatedAt: row.updatedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    reportUpdatedAt: row.reportUpdatedAt?.toISOString() ?? null,
    audits,
    status: row.status,
    humanConclusion: row.humanConclusion,
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  await resetPrismaClient();

  const beforeA = await fingerprintCase("demo-case-a");
  const beforeB = await fingerprintCase("demo-case-b");
  assert(beforeA.audits === 6, `Case A Audit 期望 6，实际 ${beforeA.audits}`);
  assert(beforeB.audits === 4, `Case B Audit 期望 4，实际 ${beforeB.audits}`);
  assert(beforeA.status === "CLOSED", "Case A status");
  assert(beforeA.humanConclusion === "NORMAL_BUSINESS", "Case A conclusion");
  assert(beforeB.status === "PENDING_VERIFICATION", "Case B status");
  assert(
    beforeB.humanConclusion === "SUSPECTED_SECURITY_INCIDENT",
    "Case B conclusion",
  );

  const viewer = await signIn("demo-viewer");
  const analyst = await signIn("demo-analyst");
  const admin = await signIn("demo-admin");

  const vCases = await getPage("/cases", viewer);
  assert(vCases.status === 200 && !vCases.forbidden, "VIEWER /cases");
  const vNew = await getPage("/cases/new", viewer);
  assert(vNew.forbidden, "VIEWER /cases/new Forbidden");
  const vCaseB = await getPage("/cases/demo-case-b", viewer);
  assert(vCaseB.status === 200 && /只读/.test(vCaseB.text), "VIEWER Case B 只读");
  const vReport = await getPage("/cases/demo-case-a/report", viewer);
  assert(vReport.status === 200 && !vReport.forbidden, "VIEWER report read");
  const vAdmin = await getPage("/admin/users", viewer);
  assert(vAdmin.forbidden && !vAdmin.createUser, "VIEWER 无用户管理");
  const vAccount = await getPage("/account", viewer);
  assert(vAccount.changePassword, "VIEWER /account");

  const aAdmin = await getPage("/admin/users", analyst);
  assert(aAdmin.forbidden, "ANALYST 无用户管理");
  const aNew = await getPage("/cases/new", analyst);
  assert(aNew.status === 200 && !aNew.forbidden, "ANALYST 可新建");
  const aAccount = await getPage("/account", analyst);
  assert(aAccount.changePassword, "ANALYST /account");

  const adminUsers = await getPage("/admin/users", admin);
  assert(adminUsers.createUser && !adminUsers.forbidden, "ADMIN 用户管理");
  const adminAccount = await getPage("/account", admin);
  assert(adminAccount.changePassword, "ADMIN /account");

  // 读路径不得改变 Case A/B 指纹
  const afterA = await fingerprintCase("demo-case-a");
  const afterB = await fingerprintCase("demo-case-b");
  assert(JSON.stringify(afterA) === JSON.stringify(beforeA), "Case A 指纹被读路径改变");
  assert(JSON.stringify(afterB) === JSON.stringify(beforeB), "Case B 指纹被读路径改变");

  // Logout：sign-out 后受保护页应离开 app（redirect /login）
  await fetch(`${base}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie: viewer, "content-type": "application/json" },
    body: "{}",
  });
  const afterLogout = await getPage("/cases", viewer);
  assert(
    afterLogout.status === 307 ||
      afterLogout.status === 302 ||
      afterLogout.location?.includes("/login") ||
      /登录/.test(afterLogout.text),
    "logout 后不应继续访问受保护页",
  );

  console.log("smoke-v13-rc: OK");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
