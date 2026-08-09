"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createReportDraftAction } from "@/app/(app)/cases/reportActions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";

/**
 * 案件尚未生成报告时的显式创建入口（GET 无副作用）。
 * canWrite=false 时仅展示只读说明，不提供生成按钮。
 */
export function CreateReportPanel({
  caseId,
  caseNumber,
  title,
  canWrite = true,
}: {
  caseId: string;
  caseNumber: string;
  title: string;
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);

  const handleCreate = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    setError(null);
    if (!operationIdRef.current) {
      operationIdRef.current = crypto.randomUUID();
    }
    try {
      const result = await createReportDraftAction(
        caseId,
        operationIdRef.current,
      );
      if (!result.ok) {
        setError(actionErrorMessage(result, "报告初稿生成失败，请重试。"));
        setBusy(false);
        return;
      }
      router.refresh();
      router.push(`/cases/${caseId}/report`);
    } catch {
      setError("报告初稿生成失败，请重试。");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-md border border-neutral-200 bg-white px-6 py-8">
      <div className="font-mono text-xs text-neutral-500">{caseNumber}</div>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="text-sm text-neutral-600">该案件尚未生成调查报告。</p>
      {canWrite ? (
        <>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreate()}
            className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "正在生成…" : "生成报告"}
          </button>
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          当前账号为只读访问，无法生成报告。
        </p>
      )}
    </div>
  );
}
