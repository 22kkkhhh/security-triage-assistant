"use client";

import { useEffect, useMemo, useState } from "react";
import { userRoleLabels, type UserRole } from "@/domain/auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/domain/passwordPolicy";
import {
  adminResetPasswordAction,
  changeRoleAction,
  createUserAction,
  retryRevokeSessionsAction,
  setEnabledAction,
  updateDisplayNameAction,
} from "@/app/(app)/admin/users/actions";
import type { ManagedUserView } from "@/services/auth/userAdminService";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";

const ROLES: UserRole[] = ["ADMIN", "ANALYST", "VIEWER"];

export function AdminUsersClient({
  initialUsers,
  initialEnabledAdminCount,
}: {
  initialUsers: ManagedUserView[];
  initialEnabledAdminCount: number;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [enabledAdminCount, setEnabledAdminCount] = useState(
    initialEnabledAdminCount,
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    username: "",
    displayName: "",
    email: "",
    role: "VIEWER" as UserRole,
    initialPassword: "",
    confirmPassword: "",
  });
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [editName, setEditName] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<Record<string, boolean>>({});
  const [resetForm, setResetForm] = useState<
    Record<string, { newPassword: string; confirmPassword: string }>
  >({});

  const onlyOneEnabledAdmin = enabledAdminCount <= 1;

  useEffect(() => {
    if (!createOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createOpen]);

  const upsertUser = (user: ManagedUserView) => {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === user.id);
      if (idx < 0) return [user, ...prev];
      const next = [...prev];
      next[idx] = user;
      return next;
    });
  };

  const refreshAdminCount = (list: ManagedUserView[]) => {
    setEnabledAdminCount(
      list.filter((u) => u.enabled && u.role === "ADMIN").length,
    );
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setBanner(null);
    const result = await createUserAction({ ...createForm });
    setCreating(false);
    if (!result.ok) {
      setError(actionErrorMessage(result, "创建用户失败。"));
      return;
    }
    if (result.user) {
      setUsers((prev) => {
        const next = [result.user!, ...prev];
        refreshAdminCount(next);
        return next;
      });
    }
    setBanner(result.message ?? "账号已创建。");
    setCreateForm({
      username: "",
      displayName: "",
      email: "",
      role: "VIEWER",
      initialPassword: "",
      confirmPassword: "",
    });
    setCreateOpen(false);
  };

  const isLastEnabledAdmin = (user: ManagedUserView) =>
    onlyOneEnabledAdmin && user.enabled && user.role === "ADMIN";

  const sorted = useMemo(() => users, [users]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--ui-text)]">账号目录</p>
          <p className="mt-1 text-xs text-[var(--ui-text-muted)]">共 {sorted.length} 个账号 · 启用管理员 {enabledAdminCount} 个</p>
        </div>
        <button type="button" className="ui-button ui-button-primary w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <span aria-hidden="true" className="text-base leading-none">+</span>
          创建用户
        </button>
      </div>
      {banner && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          {banner}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200/80 bg-red-50/70 px-4 py-3 text-sm text-red-900">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
          {error}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="presentation" onMouseDown={() => setCreateOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
            className="h-full w-full max-w-xl overflow-y-auto bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-lg)] sm:p-7"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ui-brand)]">账号目录</p>
                <h2 id="create-user-title" className="mt-1 text-xl font-semibold tracking-tight text-[var(--ui-text)]">创建用户</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ui-text-muted)]">创建后用户名与邮箱不可修改。请确认账号信息后，再通过安全渠道告知初始密码。</p>
              </div>
              <button type="button" className="ui-button ui-button-ghost shrink-0 px-2" aria-label="关闭创建用户" onClick={() => setCreateOpen(false)}>
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>
            <div className="mt-7 space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium text-[var(--ui-text)]">用户名</span>
            <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">创建后不可修改</span>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] shadow-[var(--ui-shadow-xs)] outline-none transition placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
              value={createForm.username}
              autoComplete="off"
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, username: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-[var(--ui-text)]">显示名称</span>
            <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">可在列表中调整</span>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] shadow-[var(--ui-shadow-xs)] outline-none transition placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
              value={createForm.displayName}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-[var(--ui-text)]">邮箱</span>
            <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">创建后不可修改</span>
            <input
              type="email"
              className="mt-2 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] shadow-[var(--ui-shadow-xs)] outline-none transition placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
              value={createForm.email}
              autoComplete="off"
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-[var(--ui-text)]">角色</span>
            <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">默认只读用户</span>
            <select
              className="mt-2 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] shadow-[var(--ui-shadow-xs)] outline-none transition focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
              value={createForm.role}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  role: e.target.value as UserRole,
                }))
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {userRoleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-[var(--ui-text)]">初始密码</span>
            <input
              type="password"
              className="mt-2 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] shadow-[var(--ui-shadow-xs)] outline-none transition placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
              value={createForm.initialPassword}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  initialPassword: e.target.value,
                }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-[var(--ui-text)]">确认初始密码</span>
            <input
              type="password"
              className="mt-2 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] shadow-[var(--ui-shadow-xs)] outline-none transition placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
              value={createForm.confirmPassword}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  confirmPassword: e.target.value,
                }))
              }
            />
          </label>
        </div>
              <div className="flex flex-col gap-3 border-t border-[var(--ui-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--ui-text-muted)]">密码长度 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 字符。创建后请通过安全渠道告知用户。</p>
          <button
          type="button"
          disabled={creating}
          onClick={() => void handleCreate()}
          className="ui-button ui-button-primary w-full sm:w-auto"
        >
          {creating ? "创建中…" : "创建用户"}
          </button>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="ui-panel overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-[var(--ui-border-subtle)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--ui-text)]">已创建账号</h2>
            <p className="mt-1 text-xs text-[var(--ui-text-muted)]">用户名和邮箱为只读字段；敏感操作收纳在每行的操作区。</p>
          </div>
          <span className="text-xs tabular-nums text-[var(--ui-text-muted)]">共 {sorted.length} 个账号</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] text-left text-xs font-medium uppercase tracking-[0.08em] text-[var(--ui-text-muted)]">
                <th className="px-5 py-3 font-medium sm:px-6">用户</th>
                <th className="px-3 py-3 font-medium">邮箱</th>
                <th className="px-3 py-3 font-medium">角色</th>
                <th className="px-3 py-3 font-medium">状态</th>
                <th className="px-3 py-3 font-medium">创建时间</th>
                <th className="px-5 py-3 text-right font-medium sm:px-6">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((user) => {
                const lastAdmin = isLastEnabledAdmin(user);
                const nameValue = editName[user.id] ?? user.displayName;
                const reset = resetForm[user.id] ?? {
                  newPassword: "",
                  confirmPassword: "",
                };
                return (
                  <tr key={user.id} className="border-b border-[var(--ui-border-subtle)] align-top transition-colors last:border-b-0 hover:bg-[var(--ui-surface-subtle)]">
                    <td className="px-5 py-4 text-right sm:px-6">
                      <div className="flex min-w-[220px] items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand-soft)] text-xs font-semibold text-[var(--ui-brand)]" aria-hidden="true">
                          {user.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {editingName[user.id] ? (
                              <input
                                aria-label={`${user.username} 的显示名称`}
                                autoFocus
                                className="h-9 w-full max-w-[220px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
                                value={nameValue}
                                onChange={(e) =>
                                  setEditName((m) => ({
                                    ...m,
                                    [user.id]: e.target.value,
                                  }))
                                }
                              />
                            ) : (
                              <p className="truncate text-sm font-medium text-[var(--ui-text)]">{user.displayName}</p>
                            )}
                            {!editingName[user.id] ? (
                              <button type="button" className="ui-button ui-button-ghost shrink-0 px-1.5 py-1 text-xs" onClick={() => setEditingName((m) => ({ ...m, [user.id]: true }))}>
                                编辑
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-[var(--ui-text-muted)]">@{user.username}</p>
                          {editingName[user.id] ? (
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  className="ui-button ui-button-primary px-2.5 py-1 text-xs"
                                  onClick={() =>
                                    void (async () => {
                                      setError(null);
                                      const result = await updateDisplayNameAction({
                                        userId: user.id,
                                        displayName: nameValue,
                                      });
                                      if (!result.ok) {
                                        setError(actionErrorMessage(result, "更新显示名称失败。"));
                                        return;
                                      }
                                      if (result.user) upsertUser(result.user);
                                      setEditingName((m) => ({ ...m, [user.id]: false }));
                                      setBanner("显示名称已更新。");
                                    })()
                                  }
                                >
                                  保存
                                </button>
                                <button type="button" className="ui-button ui-button-ghost px-2.5 py-1 text-xs" onClick={() => setEditingName((m) => ({ ...m, [user.id]: false }))}>
                                  取消
                                </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-xs text-[var(--ui-text-muted)]">{user.email}</td>
                    <td className="px-3 py-4">
                      <select
                        aria-label={`${user.username} 的角色`}
                        className="h-9 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 text-sm text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)] disabled:opacity-50"
                        value={user.role}
                        disabled={lastAdmin}
                        title={
                          lastAdmin
                            ? "系统至少需要保留一个启用的管理员。"
                            : undefined
                        }
                        onChange={(e) =>
                          void (async () => {
                            setError(null);
                            const result = await changeRoleAction({
                              userId: user.id,
                              role: e.target.value as UserRole,
                            });
                            if (!result.ok) {
                              setError(
                                actionErrorMessage(result, "角色更新失败。"),
                              );
                              return;
                            }
                            if (result.user) {
                              upsertUser(result.user);
                              setUsers((prev) => {
                                const next = prev.map((u) =>
                                  u.id === result.user!.id ? result.user! : u,
                                );
                                refreshAdminCount(next);
                                return next;
                              });
                            }
                            setBanner("角色已更新。");
                          })()
                        }
                      >
                        {ROLES.map((role) => (
                          <option
                            key={role}
                            value={role}
                            disabled={lastAdmin && role !== "ADMIN"}
                          >
                            {userRoleLabels[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`ui-badge ${
                          user.enabled
                            ? "ui-badge-success"
                            : "ui-badge-neutral"
                        }`}
                      >
                        {user.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-3 py-4 font-mono text-xs text-[var(--ui-text-muted)]">
                      {formatDateTimeForDisplay(user.createdAt)}
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <details className="relative">
                        <summary className="ui-button ui-button-secondary inline-flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-xs">
                          更多操作 <span aria-hidden="true" className="text-[10px]">⌄</span>
                        </summary>
                        <div className="absolute right-0 z-30 mt-2 w-64 space-y-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-lg)]">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={lastAdmin && user.enabled}
                          title={
                            lastAdmin && user.enabled
                              ? "系统至少需要保留一个启用的管理员。"
                              : undefined
                          }
                          className="ui-button ui-button-secondary px-2.5 py-1.5 text-xs disabled:opacity-40"
                          onClick={() =>
                            void (async () => {
                              setError(null);
                              const result = await setEnabledAction({
                                userId: user.id,
                                enabled: !user.enabled,
                              });
                              if (!result.ok) {
                                setError(
                                  actionErrorMessage(result, "状态更新失败。"),
                                );
                                return;
                              }
                              if (result.user) {
                                upsertUser(result.user);
                                setUsers((prev) => {
                                  const next = prev.map((u) =>
                                    u.id === result.user!.id ? result.user! : u,
                                  );
                                  refreshAdminCount(next);
                                  return next;
                                });
                              }
                              if (result.sessionRevokeFailed) {
                                setBanner(result.message ?? null);
                              } else {
                                setBanner(
                                  result.user?.enabled
                                    ? "账号已重新启用。"
                                    : "账号已停用。",
                                );
                              }
                            })()
                          }
                        >
                          {user.enabled ? "停用" : "启用"}
                        </button>
                        {user.enabled === false && (
                          <button
                            type="button"
                            className="ui-button ui-button-secondary border-amber-300 px-2.5 py-1.5 text-xs text-amber-800 hover:bg-amber-50"
                            onClick={() =>
                              void (async () => {
                                const result = await retryRevokeSessionsAction(
                                  user.id,
                                );
                                if (!result.ok) {
                                  setError(
                                    actionErrorMessage(
                                      result,
                                      "会话清理失败。",
                                    ),
                                  );
                                  return;
                                }
                                setBanner(result.message ?? "会话已吊销。");
                              })()
                            }
                          >
                            重试吊销会话
                          </button>
                        )}
                      </div>
                      <details className="group mt-3 max-w-xs rounded-lg border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-2.5">
                        <summary className="cursor-pointer list-none text-xs font-medium text-[var(--ui-text-muted)] outline-none transition group-open:mb-2 group-open:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[var(--ui-brand)]">
                          <span className="inline-flex items-center gap-1.5">重置密码 <span aria-hidden="true" className="text-[10px] transition group-open:rotate-180">⌄</span></span>
                        </summary>
                        <input
                          type="password"
                          className="mb-2 h-9 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 text-xs text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
                          placeholder="新密码"
                          autoComplete="new-password"
                          value={reset.newPassword}
                          onChange={(e) =>
                            setResetForm((m) => ({
                              ...m,
                              [user.id]: {
                                ...reset,
                                newPassword: e.target.value,
                              },
                            }))
                          }
                        />
                        <input
                          type="password"
                          className="mb-2 h-9 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 text-xs text-[var(--ui-text)] outline-none transition focus:border-[var(--ui-brand)] focus:ring-2 focus:ring-[var(--ui-brand-soft)]"
                          placeholder="确认新密码"
                          autoComplete="new-password"
                          value={reset.confirmPassword}
                          onChange={(e) =>
                            setResetForm((m) => ({
                              ...m,
                              [user.id]: {
                                ...reset,
                                confirmPassword: e.target.value,
                              },
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="ui-button ui-button-primary px-2.5 py-1.5 text-xs"
                          onClick={() =>
                            void (async () => {
                              setError(null);
                              const result = await adminResetPasswordAction({
                                userId: user.id,
                                newPassword: reset.newPassword,
                                confirmPassword: reset.confirmPassword,
                              });
                              if (!result.ok) {
                                setError(
                                  actionErrorMessage(result, "重置密码失败。"),
                                );
                                return;
                              }
                              setResetForm((m) => ({
                                ...m,
                                [user.id]: {
                                  newPassword: "",
                                  confirmPassword: "",
                                },
                              }));
                              setBanner(result.message ?? "密码已重置。");
                            })()
                          }
                        >
                          确认重置
                        </button>
                        <button
                          type="button"
                          className="ui-button ui-button-ghost ml-1 px-2.5 py-1.5 text-xs"
                          onClick={(event) => {
                            const resetDetails = event.currentTarget.closest("details");
                            resetDetails?.removeAttribute("open");
                            resetDetails?.parentElement?.closest("details")?.removeAttribute("open");
                            setResetForm((m) => ({
                              ...m,
                              [user.id]: { newPassword: "", confirmPassword: "" },
                            }));
                          }}
                        >
                          取消
                        </button>
                      </details>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
