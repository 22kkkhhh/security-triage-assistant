"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import {
  isCaseListNavActive,
  isReportsNavActive,
} from "@/components/layout/appShellNav";
import { userRoleLabels, type UserRole } from "@/domain/auth";
import type { NavigationCapabilities } from "@/domain/uiCapabilities";

export {
  isCaseListNavActive,
  isCaseReportPath,
  isReportsNavActive,
} from "@/components/layout/appShellNav";

type NavItem = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  requiresCreateCase?: boolean;
  requiresManageUsers?: boolean;
  requiresChangeOwnPassword?: boolean;
  /** 主导作：视觉重量高于普通导航项 */
  emphasize?: boolean;
};

const navItems: NavItem[] = [
  {
    href: "/cases/new",
    label: "+ 新建研判",
    match: (path: string) => path.startsWith("/cases/new"),
    requiresCreateCase: true,
    emphasize: true,
  },
  {
    href: "/cases",
    label: "历史案件",
    match: isCaseListNavActive,
  },
  {
    href: "/reports",
    label: "报告中心",
    match: isReportsNavActive,
  },
  {
    href: "/admin/users",
    label: "用户管理",
    match: (path: string) => path.startsWith("/admin/users"),
    requiresManageUsers: true,
  },
  {
    href: "/account",
    label: "账户",
    match: (path: string) => path.startsWith("/account"),
    requiresChangeOwnPassword: true,
  },
];

export type AppShellUser = {
  displayName: string;
  role: UserRole;
};

/**
 * 调查工作台壳：侧栏导航 + 主内容区。
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
  /** 打开时绑定当前 path；路由变化后自动视为关闭，避免 effect setState */
  const [navOpenForPath, setNavOpenForPath] = useState<string | null>(null);
  const navOpen = navOpenForPath === pathname;

  const visibleNav = navItems.filter((item) => {
    if (item.requiresCreateCase && !navigation.canCreateCase) return false;
    if (item.requiresManageUsers && !navigation.canManageUsers) return false;
    if (item.requiresChangeOwnPassword && !navigation.canChangeOwnPassword) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 text-slate-100 md:hidden">
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="app-shell-nav"
          aria-label={navOpen ? "关闭导航菜单" : "打开导航菜单"}
          onClick={() =>
            setNavOpenForPath((current) =>
              current === pathname ? null : pathname,
            )
          }
          className="min-h-9 rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-800"
        >
          菜单
        </button>
        <div className="min-w-0 truncate text-sm font-semibold tracking-wide">
          Security Triage Assistant
        </div>
      </div>

      {navOpen ? (
        <button
          type="button"
          aria-label="关闭导航菜单"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setNavOpenForPath(null)}
        />
      ) : null}

      <aside
        id="app-shell-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-[230px] shrink-0 flex-col bg-slate-900 text-slate-100 transition-transform duration-200 md:static md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5">
          <div className="text-sm font-semibold tracking-wide">
            Security Triage Assistant
          </div>
          <div className="mt-1 text-xs text-slate-400">调查工作台</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
          {visibleNav.map((item) => {
            const active = item.match(pathname);
            const base = item.emphasize
              ? active
                ? "bg-white text-slate-900"
                : "border border-slate-500 text-white hover:bg-slate-800"
              : active
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-800/80 hover:text-white";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavOpenForPath(null)}
                className={`rounded px-3 py-2.5 text-sm transition-colors ${base}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-slate-800 px-5 py-4 text-xs leading-5 text-slate-400">
          <div>
            <div className="text-sm text-slate-200">{user.displayName}</div>
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
          <p className="text-[11px] leading-4 text-slate-500">
            Demo · 虚构数据 · 结论需人工确认
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto pt-12 md:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      </main>
    </div>
  );
}
