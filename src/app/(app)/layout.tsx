import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import {
  ForbiddenError,
  UnauthenticatedError,
  type AuthUser,
} from "@/domain/auth";
import { auth } from "@/lib/auth";
import { requireAuthenticatedUser } from "@/services/auth/currentUser";

/**
 * 受保护 App Layout：Server 侧 requireAuthenticatedUser。
 * 注意：页面保护 ≠ Server Action RBAC（Step 4）。
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

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
