"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { userRoleLabels, type UserRole } from "@/domain/auth";
import type { NavigationCapabilities } from "@/domain/uiCapabilities";

type NavItem = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  requiresCreateCase?: boolean;
};

const navItems: NavItem[] = [
  {
    href: "/cases/new",
    label: "+ 新建研判",
    match: (path: string) => path.startsWith("/cases/new"),
    requiresCreateCase: true,
  },
  {
    href: "/cases",
    label: "历史案件",
    match: (path: string) =>
      path === "/cases" ||
      (path.startsWith("/cases/") && !path.startsWith("/cases/new")),
  },
  {
    href: "/reports",
    label: "报告中心",
    match: (path: string) => path.startsWith("/reports"),
  },
];

export type AppShellUser = {
  displayName: string;
  role: UserRole;
};

/**
 * 企业级应用壳：深色侧边栏 + 浅色主内容区。
 * 导航可见性来自 Server 派生的 NavigationCapabilities（UX）；
 * 安全边界仍是 Server Authorization。
 */
export function AppShell({
  children,
  user,
  navigation,
  showReadOnlyHint = false,
}: {
  children: ReactNode;
  user: AppShellUser;
  navigation: NavigationCapabilities;
  showReadOnlyHint?: boolean;
}) {
  const pathname = usePathname() ?? "/cases";
  const visibleNav = navItems.filter(
    (item) => !item.requiresCreateCase || navigation.canCreateCase,
  );

  return (
    <div className="flex min-h-screen bg-neutral-100 text-neutral-900">
      <aside className="flex w-[230px] shrink-0 flex-col bg-slate-900 text-slate-100">
        <div className="border-b border-slate-700 px-5 py-5">
          <div className="text-sm font-semibold tracking-wide">
            Security Triage Assistant
          </div>
          <div className="mt-1 text-xs text-slate-400">安全研判助手</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {visibleNav.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-slate-700 px-5 py-4 text-xs leading-5 text-slate-400">
          <div>
            <div className="text-slate-200">{user.displayName}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span>{userRoleLabels[user.role]}</span>
              {showReadOnlyHint ? (
                <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">
                  只读
                </span>
              ) : null}
            </div>
            <div className="mt-2">
              <LogoutButton />
            </div>
          </div>
          <div className="text-slate-500">
            系统说明
            <br />
            本地 Demo · 仅使用虚构数据
            <br />
            最终结论以人工确认为准
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
