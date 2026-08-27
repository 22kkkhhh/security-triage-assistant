"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LogoutButton({ className }: { className?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onLogout()}
      disabled={busy}
      className={className ?? "text-xs text-slate-300 underline-offset-2 hover:text-white hover:underline disabled:opacity-60"}
    >
      {busy ? "退出中…" : "退出登录"}
    </button>
  );
}
