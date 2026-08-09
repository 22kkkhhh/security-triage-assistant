"use client";

import { useRef, useState } from "react";
import { exportReportAction } from "@/app/(app)/cases/reportActions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";

/**
 * 报告中心导出：与报告页共用 exportReportCommand / exportReportAction。
 */
export function ReportExportButton({ caseId }: { caseId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    if (!operationIdRef.current) {
      operationIdRef.current = crypto.randomUUID();
    }
    try {
      const result = await exportReportAction(
        caseId,
        operationIdRef.current,
        true,
      );
      if (!result.ok) {
        setError(actionErrorMessage(result, "Word 报告导出失败，请重试。"));
        return;
      }
      const bytes = Uint8Array.from(atob(result.fileBase64), (c) =>
        c.charCodeAt(0),
      );
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
      operationIdRef.current = null;
    } catch {
      setError("Word 报告导出失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleExport()}
        className="text-sm text-slate-800 underline-offset-2 hover:underline disabled:opacity-40"
      >
        {busy ? "导出中…" : "导出 Word"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
