"use client";

import { useState } from "react";
import { getReportExportPayloadAction } from "@/app/(app)/cases/reportActions";
import {
  generateDocxBlob,
  suggestDocxFileName,
} from "@/services/reporting/docxGenerator";
import { scanSensitive } from "@/services/reporting/masking";

/**
 * 报告中心导出：仅使用已保存 reportDraft，绝不临时 buildReportData。
 */
export function ReportExportButton({ caseId }: { caseId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await getReportExportPayloadAction(caseId);
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      const plain = [
        payload.report.title,
        ...payload.report.sections.map((s) => s.content),
      ].join("\n");
      const findings = scanSensitive(plain);
      const maskSensitive = findings.length > 0;
      const blob = await generateDocxBlob(
        payload.report,
        {
          evidences: payload.evidences,
          timeline: payload.timeline,
        },
        { maskSensitive },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestDocxFileName(payload.report);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Word 导出失败，请重试。");
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
