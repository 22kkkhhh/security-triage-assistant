"use client";

import { useState } from "react";
import { changeOwnPasswordAction } from "@/app/(app)/account/actions";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/domain/passwordPolicy";
import { actionErrorMessage } from "@/lib/actionErrorMessage";

export function AccountPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="max-w-md space-y-4 rounded-md border border-neutral-200 bg-white px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          setError(null);
          setMessage(null);
          const result = await changeOwnPasswordAction({
            currentPassword,
            newPassword,
            confirmPassword,
          });
          setBusy(false);
          if (!result.ok) {
            setError(actionErrorMessage(result, "修改密码失败。"));
            return;
          }
          setMessage(result.message);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        })();
      }}
    >
      <h2 className="text-sm font-semibold text-neutral-900">修改密码</h2>
      {message && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <label className="block text-sm">
        <span className="text-neutral-500">当前密码</span>
        <input
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          value={currentPassword}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-500">新密码</span>
        <input
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          value={newPassword}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-500">确认新密码</span>
        <input
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          value={confirmPassword}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </label>
      <p className="text-xs text-neutral-500">
        密码长度 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 字符。修改成功后其他设备上的会话将被吊销。
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {busy ? "提交中…" : "保存新密码"}
      </button>
    </form>
  );
}
