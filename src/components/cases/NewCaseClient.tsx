"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCaseAction } from "@/app/(app)/cases/actions";
import { ImportFlow } from "@/components/import/ImportFlow";
import type { NormalizedSecurityInput } from "@/services/normalization/types";

/**
 * 新建研判客户端：复用 ImportFlow，确认后 createCaseAction → 跳转 /cases/[id]。
 */
export function NewCaseClient() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const handleConfirmed = async (input: NormalizedSecurityInput) => {
    if (submittingRef.current || creating) return;
    submittingRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const result = await createCaseAction(input);
      if (!result.ok) {
        setError("案件创建失败，请重试。");
        setCreating(false);
        submittingRef.current = false;
        return;
      }
      router.push(`/cases/${result.id}`);
    } catch {
      setError("案件创建失败，请重试。");
      setCreating(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
          {error.includes("重试") && (
            <span className="ml-2 text-red-600">确认内容已保留，可再次提交。</span>
          )}
        </div>
      )}
      {creating && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          正在创建案件…
        </div>
      )}
      <ImportFlow onConfirmed={handleConfirmed} confirming={creating} />
    </div>
  );
}
