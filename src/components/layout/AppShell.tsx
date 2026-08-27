"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
    label: "案件队列",
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
];

export type AppShellUser = {
  displayName: string;
  role: UserRole;
};

function UserMenu({
  user,
  canChangeOwnPassword,
  showReadOnlyHint = false,
  compact = false,
}: {
  user: AppShellUser;
  canChangeOwnPassword: boolean;
  showReadOnlyHint?: boolean;
  compact?: boolean;
}) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ui-text)] outline-none transition hover:bg-[var(--ui-surface-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--ui-brand)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-brand-soft)] text-xs font-semibold text-[var(--ui-brand)]" aria-hidden="true">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        {!compact ? (
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[140px] truncate text-xs font-medium">{user.displayName}</span>
            <span className="block text-[11px] text-[var(--ui-text-muted)]">{userRoleLabels[user.role]}</span>
          </span>
        ) : null}
        <span aria-hidden="true" className="text-xs text-[var(--ui-text-muted)]">⌄</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1.5 shadow-[var(--ui-shadow-lg)]">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-[var(--ui-text)]">{user.displayName}</p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--ui-text-muted)]">
            <span>{userRoleLabels[user.role]}</span>
            {showReadOnlyHint ? <span className="rounded bg-[var(--ui-surface-subtle)] px-1.5 py-0.5 text-[10px]">只读</span> : null}
          </div>
        </div>
        {canChangeOwnPassword ? (
          <Link href="/account" className="block rounded-lg px-3 py-2 text-sm text-[var(--ui-text-secondary)] transition hover:bg-[var(--ui-surface-subtle)] hover:text-[var(--ui-text)]">账户设置</Link>
        ) : null}
        <div className="mt-1 border-t border-[var(--ui-border-subtle)] pt-1">
          <LogoutButton className="ui-button ui-button-ghost w-full justify-start px-3 py-2 text-sm text-[var(--ui-text-secondary)]" />
        </div>
      </div>
    </details>
  );
}

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
  const [managementOpen, setManagementOpen] = useState(pathname.startsWith("/admin"));
  const [commandOpen, setCommandOpen] = useState(false);
  const navOpen = navOpenForPath === pathname;
  const managementExpanded = managementOpen || pathname.startsWith("/admin");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isVisible = (item: NavItem) => {
    if (item.requiresCreateCase && !navigation.canCreateCase) return false;
    if (item.requiresManageUsers && !navigation.canManageUsers) return false;
    if (item.requiresChangeOwnPassword && !navigation.canChangeOwnPassword) {
      return false;
    }
    return true;
  };

  const visibleNav = navItems.filter((item) => !item.requiresManageUsers && isVisible(item));
  const visibleManageNav = navItems.filter((item) => item.requiresManageUsers && isVisible(item));

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
          数据与网络安全联合研判及案件运营助手
        </div>
        <div className="ml-auto"><UserMenu user={user} canChangeOwnPassword={navigation.canChangeOwnPassword} showReadOnlyHint={showReadOnlyHint} compact /></div>
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
            数据与网络安全联合研判及案件运营助手
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
          {visibleManageNav.length > 0 ? (
            <>
              <div className="my-3 border-t border-slate-800" />
              <button
                type="button"
                aria-expanded={managementExpanded}
                className="flex w-full items-center justify-between rounded px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
                onClick={() => setManagementOpen((open) => !open)}
              >
                <span>管理</span>
                <span aria-hidden="true" className={`text-xs transition-transform ${managementExpanded ? "rotate-180" : ""}`}>⌄</span>
              </button>
              {managementExpanded ? visibleManageNav.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setNavOpenForPath(null)}
                    aria-current={active ? "page" : undefined}
                    className={`ml-3 rounded px-3 py-2.5 pl-5 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800/80 hover:text-white"}`}
                  >
                    {item.label}
                  </Link>
                );
              }) : null}
            </>
          ) : null}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-xs leading-5 text-slate-400">
          <p className="text-[11px] leading-4 text-slate-500">
            Demo · 虚构数据 · 结论需人工确认
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto pt-12 md:pt-0">
        <div className="min-h-screen">
          <div className="relative hidden h-14 items-center justify-end border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-6 md:flex">
            <div className="absolute left-1/2 w-[min(560px,46vw)] -translate-x-1/2">
              <button
                type="button"
                aria-expanded={commandOpen}
                aria-haspopup="dialog"
                aria-label="打开快速访问"
                onClick={() => setCommandOpen((open) => !open)}
                className="flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-3 text-left text-sm text-[var(--ui-text-muted)] transition hover:border-[var(--ui-brand)] hover:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-brand)]"
              >
                <span aria-hidden="true" className="text-base leading-none">⌕</span>
                <span className="min-w-0 flex-1 truncate">搜索案件、报告、账号等…</span>
                <kbd className="hidden rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-muted)] sm:inline">Ctrl K</kbd>
              </button>
              {commandOpen ? (
                <div role="dialog" aria-label="快速访问" className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1.5 shadow-[var(--ui-shadow-lg)]">
                  <p className="px-3 py-2 text-xs text-[var(--ui-text-muted)]">快速访问</p>
                  <Link href="/cases" onClick={() => setCommandOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]">案件队列 <span className="ml-2 text-xs text-[var(--ui-text-muted)]">查看与筛选案件</span></Link>
                  <Link href="/reports" onClick={() => setCommandOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]">报告中心 <span className="ml-2 text-xs text-[var(--ui-text-muted)]">查看调查报告</span></Link>
                  {navigation.canManageUsers ? <Link href="/admin/users" onClick={() => setCommandOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]">用户管理 <span className="ml-2 text-xs text-[var(--ui-text-muted)]">管理账号与角色</span></Link> : null}
                </div>
              ) : null}
            </div>
            <UserMenu user={user} canChangeOwnPassword={navigation.canChangeOwnPassword} showReadOnlyHint={showReadOnlyHint} />
          </div>
          <div className="w-full max-w-[1360px] px-4 py-5 sm:px-6 sm:py-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
