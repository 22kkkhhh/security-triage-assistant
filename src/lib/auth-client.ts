/**
 * Better Auth 浏览器客户端（仅 Login / Logout / Session）。
 * 不引入 adminClient；用户管理走 Security Triage Server Actions + Permission。
 */
"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
