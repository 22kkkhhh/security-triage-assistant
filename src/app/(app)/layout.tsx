import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import {
  ForbiddenError,
  UnauthenticatedError,
  type AuthUser,
} from "@/domain/auth";
import { buildAppShellCapabilities } from "@/domain/uiCapabilities";
import { auth } from "@/lib/auth";
import { requireAuthenticatedUser } from "@/services/auth/currentUser";

/**
 * 受保护 App Layout：Server 侧 requireAuthenticatedUser。
 * UI 导航能力由 Permission SoT 派生；安全边界仍是 Server Authorization。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let user: AuthUser;
  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
      redirect("/login?reason=disabled");
    }
    redirect("/login");
  }

  const shell = buildAppShellCapabilities(user);

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        role: user.role,
      }}
      navigation={shell.navigation}
      showReadOnlyHint={shell.showReadOnlyHint}
    >
      {children}
    </AppShell>
  );
}
