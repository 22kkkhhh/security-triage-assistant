"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const GENERIC_LOGIN_ERROR = "用户名或密码错误";

export function LoginForm({
  initialReason,
}: {
  initialReason?: string | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    initialReason === "disabled"
      ? "账号已停用，请联系管理员"
      : null,
  );
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const trimmed = username.trim();
    if (!trimmed || !password) {
      setError("请输入用户名和密码");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await authClient.signIn.username({
        username: trimmed,
        password,
      });
      if (result.error) {
        setError(GENERIC_LOGIN_ERROR);
        return;
      }
      router.replace("/cases");
      router.refresh();
    } catch {
      setError(GENERIC_LOGIN_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <div>
        <label
          htmlFor="login-username"
          className="mb-1 block text-sm font-medium text-neutral-700"
        >
          用户名
        </label>
        <input
          id="login-username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={submitting}
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>
      <div>
        <label
          htmlFor="login-password"
          className="mb-1 block text-sm font-medium text-neutral-700"
        >
          密码
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
