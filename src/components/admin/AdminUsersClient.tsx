"use client";

import { useMemo, useState } from "react";
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

  const [editName, setEditName] = useState<Record<string, string>>({});
  const [resetForm, setResetForm] = useState<
    Record<string, { newPassword: string; confirmPassword: string }>
  >({});

  const onlyOneEnabledAdmin = enabledAdminCount <= 1;

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
  };

  const isLastEnabledAdmin = (user: ManagedUserView) =>
    onlyOneEnabledAdmin && user.enabled && user.role === "ADMIN";

  const sorted = useMemo(() => users, [users]);

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800">
          {banner}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="space-y-3 rounded-md border border-neutral-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-neutral-900">创建用户</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="text-neutral-500">用户名</span>
            <input
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              value={createForm.username}
              autoComplete="off"
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, username: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">显示名称</span>
            <input
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              value={createForm.displayName}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">邮箱</span>
            <input
              type="email"
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              value={createForm.email}
              autoComplete="off"
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">角色</span>
            <select
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
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
            <span className="text-neutral-500">初始密码</span>
            <input
              type="password"
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
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
            <span className="text-neutral-500">确认初始密码</span>
            <input
              type="password"
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
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
        <p className="text-xs text-neutral-500">
          密码长度 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 字符。创建后请通过安全渠道告知用户。
        </p>
        <button
          type="button"
          disabled={creating}
          onClick={() => void handleCreate()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {creating ? "创建中…" : "创建用户"}
        </button>
      </section>

      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                <th className="px-3 py-2 font-medium">显示名称</th>
                <th className="px-3 py-2 font-medium">用户名</th>
                <th className="px-3 py-2 font-medium">邮箱</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">创建时间</th>
                <th className="px-3 py-2 font-medium">操作</th>
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
                  <tr key={user.id} className="border-b border-neutral-100 align-top">
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <input
                          className="w-40 rounded border border-neutral-300 px-2 py-1 text-sm"
                          value={nameValue}
                          onChange={(e) =>
                            setEditName((m) => ({
                              ...m,
                              [user.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="self-start text-xs text-slate-700 underline"
                          onClick={() =>
                            void (async () => {
                              setError(null);
                              const result = await updateDisplayNameAction({
                                userId: user.id,
                                displayName: nameValue,
                              });
                              if (!result.ok) {
                                setError(
                                  actionErrorMessage(result, "更新显示名称失败。"),
                                );
                                return;
                              }
                              if (result.user) upsertUser(result.user);
                              setBanner("显示名称已更新。");
                            })()
                          }
                        >
                          保存名称
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{user.username}</td>
                    <td className="px-3 py-2 text-xs">{user.email}</td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
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
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs ${
                          user.enabled
                            ? "border-green-200 bg-green-50 text-green-800"
                            : "border-neutral-200 bg-neutral-50 text-neutral-600"
                        }`}
                      >
                        {user.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                      {formatDateTimeForDisplay(user.createdAt)}
                    </td>
                    <td className="space-y-2 px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={lastAdmin && user.enabled}
                          title={
                            lastAdmin && user.enabled
                              ? "系统至少需要保留一个启用的管理员。"
                              : undefined
                          }
                          className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40"
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
                            className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-800"
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
                      <div className="space-y-1 rounded border border-neutral-100 bg-neutral-50 p-2">
                        <div className="text-xs text-neutral-500">重置密码</div>
                        <input
                          type="password"
                          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
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
                          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
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
                          className="rounded bg-slate-800 px-2 py-1 text-xs text-white"
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
                      </div>
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
