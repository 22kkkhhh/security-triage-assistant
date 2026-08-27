"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const GENERIC_LOGIN_ERROR = "用户名或密码错误";

export function LoginForm({ initialReason }: { initialReason?: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialReason === "disabled" ? "账号已停用，请联系管理员" : null);
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
      const result = await authClient.signIn.username({ username: trimmed, password });
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
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      <div>
        <label htmlFor="login-username" className="mb-2 block text-sm font-medium text-[#26384d]">用户名</label>
        <input id="login-username" name="username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={submitting} className="h-11 w-full rounded-xl border border-[#d6e0eb] bg-white px-3.5 text-sm text-[#142235] outline-none transition placeholder:text-[#94a2b3] focus:border-[#2c6bed] focus:ring-4 focus:ring-[#2c6bed]/10 disabled:cursor-not-allowed disabled:bg-[#eef3f8]" />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#26384d]">密码</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} className="h-11 w-full rounded-xl border border-[#d6e0eb] bg-white px-3.5 text-sm text-[#142235] outline-none transition placeholder:text-[#94a2b3] focus:border-[#2c6bed] focus:ring-4 focus:ring-[#2c6bed]/10 disabled:cursor-not-allowed disabled:bg-[#eef3f8]" />
      </div>
      {error ? <p className="rounded-xl border border-[#f3c5c5] bg-[#fff3f3] px-3.5 py-3 text-sm text-[#b42318]" role="alert">{error}</p> : null}
      <button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#2463e8] px-4 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition hover:bg-[#1d55ca] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2c6bed]/20 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "正在登录…" : "登录工作台"}</button>
      <p className="text-center text-xs text-[#7a8a9c]">遇到账号问题，请联系系统管理员</p>
    </form>
  );
}
