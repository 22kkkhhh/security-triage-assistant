/**
 * v1.5 M4 Workstream P2：用户可见错误净化契约。
 *
 * 目标：未知内部异常（Prisma / SQL / stack / 路径 / auth 库细节）不得进入
 * 浏览器可见响应；已知业务状态仍保留明确可操作文案与 code。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERIC_ACTION_ERROR_MESSAGE,
  isUserSafeMessage,
  sanitizeActionErrorMessage,
  unknownActionErrorMessage,
} from "@/app/(app)/actionErrorSanitizer";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

const INTERNAL_SAMPLES: Array<[string, string]> = [
  [
    "Prisma 客户端异常",
    "Invalid `prisma.caseRecord.create()` invocation in /app/src/services/persistence/caseRepository.ts:134",
  ],
  ["Prisma 错误码", "Unique constraint failed on the fields: (`caseNumber`) P2002"],
  ["SQL 语句", "SQLITE_BUSY: database is locked while running SELECT * FROM CaseRecord"],
  [
    "stack frame",
    "TypeError: Cannot read properties of undefined\n    at saveCaseSnapshot (/app/src/services/persistence/caseRepository.ts:210:5)",
  ],
  ["Windows 文件路径", "ENOENT: no such file or directory, open 'C:\\app\\prisma\\dev.db'"],
  ["auth 库内部细节", "better-auth: failed to createUser, adapter threw at Object.createUser"],
  ["resolver 实现细节", "resolveCaseCompliance failed in src/services/knowledge/resolveCaseCompliance.ts"],
];

const SAFE_SAMPLES = [
  "案件已发生更新，已刷新到最新状态。",
  "当前账号无权限执行此操作",
  "案件不存在",
  "报告草稿不存在",
  "operationId 无效",
  "两次输入的新密码不一致。",
  "报告已在其他页面发生更新。为避免覆盖，请刷新后重新确认内容。",
];

describe("isUserSafeMessage / sanitizeActionErrorMessage", () => {
  it.each(INTERNAL_SAMPLES)(
    "未知内部异常不进入用户可见响应：%s",
    (_name, raw) => {
      expect(isUserSafeMessage(raw)).toBe(false);
      const sanitized = sanitizeActionErrorMessage(raw, "案件保存暂未完成，请稍后重试。");
      expect(sanitized).toBe("案件保存暂未完成，请稍后重试。");
      expect(sanitized).not.toContain("prisma");
      expect(sanitized).not.toContain("Prisma");
      expect(sanitized).not.toContain("SELECT");
      expect(sanitized).not.toContain("    at ");
      expect(sanitized).not.toContain("/src/");
      expect(sanitized).not.toContain("C:\\");
    },
  );

  it.each(SAFE_SAMPLES)("已知业务文案保持可操作：%s", (message) => {
    expect(isUserSafeMessage(message)).toBe(true);
    expect(sanitizeActionErrorMessage(message, GENERIC_ACTION_ERROR_MESSAGE)).toBe(
      message,
    );
  });

  it("空 / 非字符串 / 超长内容退回稳定文案", () => {
    expect(sanitizeActionErrorMessage(undefined)).toBe(
      GENERIC_ACTION_ERROR_MESSAGE,
    );
    expect(sanitizeActionErrorMessage("   ")).toBe(GENERIC_ACTION_ERROR_MESSAGE);
    expect(sanitizeActionErrorMessage(new Error("boom"))).toBe(
      GENERIC_ACTION_ERROR_MESSAGE,
    );
    expect(sanitizeActionErrorMessage("案件".repeat(300))).toBe(
      GENERIC_ACTION_ERROR_MESSAGE,
    );
  });

  it("unknownActionErrorMessage 不读取 error 内容", () => {
    expect(unknownActionErrorMessage("案件创建暂未完成，请稍后重试。")).toBe(
      "案件创建暂未完成，请稍后重试。",
    );
    expect(unknownActionErrorMessage()).toBe(GENERIC_ACTION_ERROR_MESSAGE);
  });

  it("不同错误不被吞成同一句：业务文案与兜底文案可区分", () => {
    const business = sanitizeActionErrorMessage("案件不存在", "案件保存暂未完成，请稍后重试。");
    const internal = sanitizeActionErrorMessage(
      "Invalid `prisma.caseRecord.update()` invocation",
      "案件保存暂未完成，请稍后重试。",
    );
    expect(business).not.toBe(internal);
  });
});

describe("Server Action 边界不再回传 error.message", () => {
  const actionFiles = [
    "app/(app)/cases/actions.ts",
    "app/(app)/cases/commandActions.ts",
    "app/(app)/cases/reportActions.ts",
    "app/(app)/account/actions.ts",
    "app/(app)/admin/users/actions.ts",
  ];

  it.each(actionFiles)("%s 不把 error.message / String(error) 返回用户", (rel) => {
    const src = readSrc(rel);
    expect(src).not.toMatch(/error:\s*error\.message/);
    expect(src).not.toMatch(/error instanceof Error \? error\.message/);
    expect(src).not.toContain("String(error)");
    expect(src).not.toContain(".stack");
  });

  it("service 返回文案经 sanitizeActionErrorMessage 过滤", () => {
    for (const rel of [
      "app/(app)/cases/commandActions.ts",
      "app/(app)/cases/reportActions.ts",
      "app/(app)/cases/actions.ts",
    ]) {
      const src = readSrc(rel);
      expect(src).toContain("sanitizeActionErrorMessage");
      expect(src).not.toMatch(/\berror:\s*result\.error,/);
      expect(src).not.toMatch(/\berror:\s*created\.error,/);
    }
  });

  it("已知 code 仍然保留（不吞成单一状态）", () => {
    const commands = readSrc("app/(app)/cases/commandActions.ts");
    expect(commands).toContain('code: "STALE"');
    expect(commands).toContain('code: "FORBIDDEN"');
    const report = readSrc("app/(app)/cases/reportActions.ts");
    expect(report).toContain('code: "STALE_REPORT"');
    const admin = readSrc("app/(app)/admin/users/actions.ts");
    expect(admin).toContain("code: error.code");
  });
});

describe("Client 侧不展示内部异常细节", () => {
  it("autosave hooks 未知异常只用稳定中文文案", () => {
    for (const rel of ["hooks/useCaseAutosave.ts", "hooks/useReportAutosave.ts"]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/error instanceof Error \? error\.message/);
      expect(src).toContain("暂未完成，请稍后重试。");
    }
  });

  it("错误边界不渲染 error.message / stack / digest", () => {
    for (const rel of ["app/(app)/error.tsx", "app/global-error.tsx"]) {
      const src = readSrc(rel);
      expect(src).toContain("当前无法完成处理");
      expect(src).not.toContain("{error.message}");
      expect(src).not.toContain("error.stack");
      expect(src).not.toContain("error.digest");
    }
  });

  it("登录页保持通用失败文案，不区分用户名/密码", () => {
    const src = readSrc("components/auth/LoginForm.tsx");
    expect(src).toContain("用户名或密码错误");
    expect(src).not.toMatch(/result\.error\.message/);
  });
});

describe("RBAC / VIEWER 不受本轮改动影响", () => {
  it("Server Action Permission 合同表未被改动", () => {
    const src = readSrc("services/auth/requirePermission.ts");
    expect(src).toContain("SERVER_ACTION_PERMISSIONS");
    expect(src).toContain('saveCaseStateAction: "CASE_SNAPSHOT_WRITE"');
    expect(src).toContain('exportReportAction: "REPORT_EXPORT"');
  });

  it("Action 仍在 parse / mutation 之前调用 requirePermission", () => {
    for (const rel of [
      "app/(app)/cases/actions.ts",
      "app/(app)/cases/commandActions.ts",
      "app/(app)/cases/reportActions.ts",
    ]) {
      const src = readSrc(rel);
      expect(src).toContain("requirePermission(");
      expect(src).toContain("toAuthActionFailure(error)");
    }
  });

  it("UNAUTHENTICATED / FORBIDDEN 文案不被替换为通用兜底", () => {
    const src = readSrc("services/auth/requirePermission.ts");
    expect(src).toContain("登录状态已失效，请重新登录");
    expect(src).toContain("当前账号无权限执行此操作");
    expect(isUserSafeMessage("登录状态已失效，请重新登录")).toBe(true);
    expect(isUserSafeMessage("当前账号无权限执行此操作")).toBe(true);
  });
});
