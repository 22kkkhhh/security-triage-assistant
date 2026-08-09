/**
 * Better Auth Admin Plugin 的 auth-lifecycle ACL。
 * 仅控制 Better Auth 用户/会话管理能力，不替代 Security Triage ROLE_PERMISSIONS。
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,
} as const;

export const authAccessControl = createAccessControl(statement);

/** Security Triage ADMIN：最小必要 auth lifecycle；禁止 delete / impersonate / ban */
export const authRoleAdmin = authAccessControl.newRole({
  user: ["create", "list", "get", "update", "set-role", "set-password"],
  session: ["list", "revoke", "delete"],
});

export const authRoleAnalyst = authAccessControl.newRole({
  user: [],
  session: [],
});

export const authRoleViewer = authAccessControl.newRole({
  user: [],
  session: [],
});

export const authAdminRoles = {
  ADMIN: authRoleAdmin,
  ANALYST: authRoleAnalyst,
  VIEWER: authRoleViewer,
} as const;
