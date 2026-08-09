/**
 * Better Auth 浏览器客户端（仅 Login / Logout / Session）。
 * 不引入 adminClient（用户管理 UI 属后续 Step）。
 */
"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
