/**
 * v1.3 Step 1：Auth Domain / Permission 矩阵与授权语义。
 */
import { describe, expect, it } from "vitest";
import {
  authorize,
  ForbiddenError,
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  UnauthenticatedError,
  USER_ROLES,
  type AuthUser,
  type Permission,
  type UserRole,
} from "@/domain/auth";

function user(
  role: UserRole,
  enabled = true,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  return {
    id: `u-${role.toLowerCase()}`,
    username: role.toLowerCase(),
    displayName: `${role}（Mock）`,
    email: `${role.toLowerCase()}@example.test`,
    role,
    enabled,
    ...overrides,
  };
}

const VIEWER_ALLOW: Permission[] = [
  "CASE_READ",
  "ACTIVITY_READ",
  "REPORT_READ",
  "PASSWORD_SELF_CHANGE",
];

const VIEWER_DENY: Permission[] = [
  "CASE_CREATE",
  "CASE_SNAPSHOT_WRITE",
  "CASE_STATUS_CHANGE",
  "CHECKLIST_WRITE",
  "BUSINESS_CONTEXT_WRITE",
  "HUMAN_REVIEW_WRITE",
  "TIMELINE_WRITE",
  "HANDOFF_WRITE",
  "REPORT_WRITE",
  "REPORT_EXPORT",
  "USER_ADMIN",
  "PASSWORD_ADMIN_RESET",
];

const ANALYST_CASE_WRITE: Permission[] = [
  "CASE_CREATE",
  "CASE_SNAPSHOT_WRITE",
  "CASE_STATUS_CHANGE",
  "CHECKLIST_WRITE",
  "BUSINESS_CONTEXT_WRITE",
  "HUMAN_REVIEW_WRITE",
  "TIMELINE_WRITE",
  "HANDOFF_WRITE",
];

describe("Permission 矩阵 — VIEWER", () => {
  const viewer = user("VIEWER");

  it.each(VIEWER_ALLOW)("%s → true", (permission) => {
    expect(hasPermission(viewer, permission)).toBe(true);
  });

  it.each(VIEWER_DENY)("%s → false", (permission) => {
    expect(hasPermission(viewer, permission)).toBe(false);
  });

  it("REPORT_READ=true 且 REPORT_EXPORT=false", () => {
    expect(hasPermission(viewer, "REPORT_READ")).toBe(true);
    expect(hasPermission(viewer, "REPORT_EXPORT")).toBe(false);
  });
});

describe("Permission 矩阵 — ANALYST", () => {
  const analyst = user("ANALYST");

  it("继承 VIEWER 读权限", () => {
    for (const p of VIEWER_ALLOW) {
      expect(hasPermission(analyst, p)).toBe(true);
    }
  });

  it("全部案件研判写权限 → true", () => {
    for (const p of ANALYST_CASE_WRITE) {
      expect(hasPermission(analyst, p)).toBe(true);
    }
  });

  it("REPORT_WRITE / REPORT_EXPORT → true", () => {
    expect(hasPermission(analyst, "REPORT_WRITE")).toBe(true);
    expect(hasPermission(analyst, "REPORT_EXPORT")).toBe(true);
  });

  it("USER_ADMIN / PASSWORD_ADMIN_RESET → false", () => {
    expect(hasPermission(analyst, "USER_ADMIN")).toBe(false);
    expect(hasPermission(analyst, "PASSWORD_ADMIN_RESET")).toBe(false);
  });
});

describe("Permission 矩阵 — ADMIN", () => {
  const admin = user("ADMIN");

  it("拥有全部 Permission", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(admin, permission)).toBe(true);
      expect(roleHasPermission("ADMIN", permission)).toBe(true);
    }
  });
});

describe("enabled 语义", () => {
  it("disabled VIEWER / ANALYST / ADMIN：hasPermission 全部 false", () => {
    for (const role of USER_ROLES) {
      const disabled = user(role, false);
      for (const permission of PERMISSIONS) {
        expect(hasPermission(disabled, permission)).toBe(false);
      }
    }
  });

  it("disabled ADMIN 即使 role 具备 USER_ADMIN：authorize → ForbiddenError", () => {
    expect(() => authorize(user("ADMIN", false), "USER_ADMIN")).toThrow(
      ForbiddenError,
    );
  });

  it("roleHasPermission 不考虑 enabled（纯 role 映射）", () => {
    expect(roleHasPermission("ADMIN", "USER_ADMIN")).toBe(true);
    expect(hasPermission(user("ADMIN", false), "USER_ADMIN")).toBe(false);
  });
});

describe("authorize / Error codes", () => {
  it("VIEWER 改状态 → ForbiddenError + FORBIDDEN", () => {
    try {
      authorize(user("VIEWER"), "CASE_STATUS_CHANGE");
      expect.unreachable("应抛 ForbiddenError");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe("FORBIDDEN");
    }
  });

  it("ANALYST USER_ADMIN → ForbiddenError", () => {
    expect(() => authorize(user("ANALYST"), "USER_ADMIN")).toThrow(
      ForbiddenError,
    );
  });

  it("ADMIN USER_ADMIN → success 返回 AuthUser", () => {
    const admin = user("ADMIN");
    expect(authorize(admin, "USER_ADMIN")).toBe(admin);
  });

  it("UnauthenticatedError code = UNAUTHENTICATED", () => {
    const error = new UnauthenticatedError();
    expect(error).toBeInstanceOf(UnauthenticatedError);
    expect(error.code).toBe("UNAUTHENTICATED");
  });
});

describe("Permission completeness", () => {
  it("ROLE_PERMISSIONS 覆盖全部 UserRole；无重复 Permission", () => {
    for (const role of USER_ROLES) {
      const list = ROLE_PERMISSIONS[role];
      expect(list).toBeDefined();
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("每个 Permission 至少被 ADMIN 覆盖；PERMISSIONS 无重复", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const permission of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.ADMIN).toContain(permission);
    }
  });

  it("PASSWORD_SELF_CHANGE：所有 role 拥有；PASSWORD_ADMIN_RESET 仅 ADMIN", () => {
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "PASSWORD_SELF_CHANGE")).toBe(true);
    }
    expect(roleHasPermission("VIEWER", "PASSWORD_ADMIN_RESET")).toBe(false);
    expect(roleHasPermission("ANALYST", "PASSWORD_ADMIN_RESET")).toBe(false);
    expect(roleHasPermission("ADMIN", "PASSWORD_ADMIN_RESET")).toBe(true);
  });

  it("CASE_SNAPSHOT_WRITE：仅 ANALYST / ADMIN", () => {
    expect(roleHasPermission("VIEWER", "CASE_SNAPSHOT_WRITE")).toBe(false);
    expect(roleHasPermission("ANALYST", "CASE_SNAPSHOT_WRITE")).toBe(true);
    expect(roleHasPermission("ADMIN", "CASE_SNAPSHOT_WRITE")).toBe(true);
  });
});
