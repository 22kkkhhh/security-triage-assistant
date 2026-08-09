/**
 * 轻量 HTTP smoke：三角色 /admin/users 与 /account（不新增 Playwright）。
 */
import { getDemoAuthPassword } from "../src/services/demo/seedDemoUsers";

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
  return { ok: res.ok, status: res.status, cookie };
}

async function getPage(path: string, cookie: string) {
  const res = await fetch(`${base}${path}`, {
    headers: { cookie },
    redirect: "manual",
  });
  const text = await res.text();
  return {
    status: res.status,
    forbidden: /无权|无权限/.test(text),
    createUser: text.includes("创建用户"),
    changePassword: text.includes("修改密码"),
  };
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const admin = await signIn("demo-admin");
  const analyst = await signIn("demo-analyst");
  const viewer = await signIn("demo-viewer");
  assert(admin.ok && analyst.ok && viewer.ok, "demo 三角色登录失败");

  const adminUsers = await getPage("/admin/users", admin.cookie);
  assert(adminUsers.status === 200 && adminUsers.createUser, "ADMIN 应可打开用户管理");
  assert(!adminUsers.forbidden, "ADMIN 用户管理不应 Forbidden");

  const analystUsers = await getPage("/admin/users", analyst.cookie);
  assert(analystUsers.status === 200 && analystUsers.forbidden, "ANALYST 应 Forbidden");
  assert(!analystUsers.createUser, "ANALYST 不应看到创建用户");

  const viewerUsers = await getPage("/admin/users", viewer.cookie);
  assert(viewerUsers.status === 200 && viewerUsers.forbidden, "VIEWER 应 Forbidden");

  for (const [name, cookie] of [
    ["admin", admin.cookie],
    ["analyst", analyst.cookie],
    ["viewer", viewer.cookie],
  ] as const) {
    const account = await getPage("/account", cookie);
    assert(
      account.status === 200 && account.changePassword,
      `${name} 应可打开账户改密`,
    );
  }

  console.log("smoke-v13-user-admin: OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
