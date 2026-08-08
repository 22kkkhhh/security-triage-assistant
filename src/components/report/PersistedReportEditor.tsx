"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { evidenceSourceTypeLabels } from "@/domain/labels";
import type { Evidence, ReportData, TimelineEvent } from "@/domain/types";
import {
  generateDocxBlob,
  suggestDocxFileName,
} from "@/services/reporting/docxGenerator";
import {
  scanSensitive,
  sensitiveTypeLabels,
  type SensitiveFinding,
} from "@/services/reporting/masking";
import { useReportAutosave } from "@/hooks/useReportAutosave";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import type { AutosaveState } from "@/hooks/autosaveState";
import { Panel } from "@/components/common";
import type { ReportDraftBundle } from "@/services/persistence/reportDraftService";

/**
 * 持久化报告编辑器：以 reportDraft 为唯一 Source of Truth，自动保存，导出前 flush。
 */
export function PersistedReportEditor({
  bundle,
}: {
  bundle: ReportDraftBundle;
}) {
  const router = useRouter();
  const [report, setReport] = useState<ReportData>(bundle.report);
  const reportRef = useRef(report);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [exportFindings, setExportFindings] = useState<SensitiveFinding[] | null>(
    null,
  );
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const getReport = useCallback(() => reportRef.current, []);
  const { saveState, scheduleSave, flushSave, retrySave } = useReportAutosave({
    caseId: bundle.caseId,
    getReport,
    initialSavedAt: bundle.caseUpdatedAt,
  });

  const commitReport = (
    next: ReportData,
    modeSave: "debounce" | "immediate",
  ) => {
    setReport(next);
    reportRef.current = next;
    scheduleSave(modeSave);
  };

  const selectedEvidences = useMemo(
    () =>
      bundle.context.evidences.filter((e) =>
        report.evidenceIds.includes(e.evidenceId),
      ),
    [bundle.context.evidences, report.evidenceIds],
  );

  const reportPlainText = useMemo(() => {
    const parts = [
      report.title,
      ...report.sections.map((s) => s.content),
      ...selectedEvidences.map((e) => `${e.title} ${e.summary}`),
      ...bundle.context.timeline
        .filter((event) => report.timelineEventIds.includes(event.id))
        .map((event) => `${event.title} ${event.description}`),
    ];
    return parts.join("\n");
  }, [report, selectedEvidences, bundle.context.timeline]);

  const handleBack = async () => {
    setNavigationError(null);
    if (
      saveState.status === "DIRTY" ||
      saveState.status === "SAVING" ||
      saveState.status === "ERROR"
    ) {
      const ok = await flushSave();
      if (!ok) {
        setNavigationError("报告保存失败，请重试后返回案件。");
        return;
      }
    }
    router.push(`/cases/${bundle.caseId}`);
  };

  const handleExportClick = async () => {
    setExportError(null);
    if (
      saveState.status === "DIRTY" ||
      saveState.status === "SAVING" ||
      saveState.status === "ERROR"
    ) {
      const ok = await flushSave();
      if (!ok) {
        setExportError("报告尚未保存成功，请重试后导出。");
        return;
      }
    }
    const findings = scanSensitive(reportPlainText);
    setExportFindings(findings);
  };

  const doExport = async (maskSensitive: boolean) => {
    try {
      const blob = await generateDocxBlob(
        reportRef.current,
        {
          evidences: bundle.context.evidences,
          timeline: bundle.context.timeline,
        },
        { maskSensitive },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestDocxFileName(reportRef.current);
      link.click();
      URL.revokeObjectURL(url);
      setExportFindings(null);
    } catch {
      setExportError("Word 导出失败，请重试。");
      setExportFindings(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ReportHeader
        caseNumber={bundle.caseNumber}
        title={report.title || bundle.title}
        saveState={saveState}
        navigationError={navigationError}
        exportError={exportError}
        onBack={() => void handleBack()}
        onRetry={() => {
          setNavigationError(null);
          setExportError(null);
          void retrySave();
        }}
        onExport={() => void handleExportClick()}
        mode={mode}
        onToggleMode={() => setMode(mode === "edit" ? "preview" : "edit")}
      />

      {mode === "edit" ? (
        <>
          <Panel title="事件名称">
            <input
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              value={report.title}
              onChange={(e) =>
                commitReport({ ...report, title: e.target.value }, "debounce")
              }
            />
          </Panel>

          {report.sections.map((section) => (
            <Panel key={section.key} title={section.title}>
              <textarea
                className="h-28 w-full rounded border border-neutral-300 px-2 py-1 text-sm leading-6"
                value={section.content}
                onChange={(e) =>
                  commitReport(
                    {
                      ...report,
                      sections: report.sections.map((s) =>
                        s.key === section.key
                          ? { ...s, content: e.target.value }
                          : s,
                      ),
                    },
                    "debounce",
                  )
                }
              />
              {section.key === "evidenceIntro" && (
                <EvidenceSelector
                  evidences={bundle.context.evidences}
                  selectedIds={report.evidenceIds}
                  onToggle={(evidenceId) =>
                    commitReport(
                      {
                        ...report,
                        evidenceIds: report.evidenceIds.includes(evidenceId)
                          ? report.evidenceIds.filter((id) => id !== evidenceId)
                          : [...report.evidenceIds, evidenceId],
                      },
                      "immediate",
                    )
                  }
                />
              )}
              {section.key === "timelineIntro" && (
                <p className="mt-2 text-xs text-neutral-500">
                  时间线共 {report.timelineEventIds.length}{" "}
                  条，将以结构化表格进入报告。
                </p>
              )}
            </Panel>
          ))}
        </>
      ) : (
        <ReportPreview
          report={report}
          evidences={selectedEvidences}
          timeline={bundle.context.timeline}
        />
      )}

      {exportFindings !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-md bg-white p-5 shadow-lg">
            <h2 className="text-sm font-semibold text-neutral-900">
              {exportFindings.length > 0
                ? "报告中检测到可能的敏感信息，请确认导出方式"
                : "未检测到明显敏感信息，确认导出"}
            </h2>
            {exportFindings.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                {exportFindings.map((finding, index) => (
                  <li key={index}>
                    {sensitiveTypeLabels[finding.type]}：
                    <span className="font-mono">{finding.value}</span>
                    {" → "}
                    <span className="font-mono">{finding.masked}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
                onClick={() => setExportFindings(null)}
              >
                取消
              </button>
              {exportFindings.length > 0 && (
                <button
                  type="button"
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  onClick={() => void doExport(false)}
                >
                  保持原值导出
                </button>
              )}
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
                onClick={() => void doExport(true)}
              >
                {exportFindings.length > 0 ? "使用脱敏版本导出" : "确认导出"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportHeader({
  caseNumber,
  title,
  saveState,
  navigationError,
  exportError,
  onBack,
  onRetry,
  onExport,
  mode,
  onToggleMode,
}: {
  caseNumber: string;
  title: string;
  saveState: AutosaveState;
  navigationError: string | null;
  exportError: string | null;
  onBack: () => void;
  onRetry: () => void;
  onExport: () => void;
  mode: "edit" | "preview";
  onToggleMode: () => void;
}) {
  const savedLabel = (() => {
    switch (saveState.status) {
      case "SAVING":
        return "保存中…";
      case "DIRTY":
        return "待保存…";
      case "SAVED":
        return `已保存 ${formatDateTimeForDisplay(saveState.lastSavedAt).slice(11)}`;
      case "ERROR":
        return "保存失败";
      default:
        return "已同步";
    }
  })();

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← 返回案件
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              saveState.status === "ERROR" ? "text-sm text-red-700" : "text-sm text-neutral-500"
            }
          >
            {savedLabel}
          </span>
          {saveState.status === "ERROR" && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
            >
              重试
            </button>
          )}
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            onClick={onToggleMode}
          >
            {mode === "edit" ? "预览" : "继续编辑"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            onClick={onExport}
          >
            导出 Word
          </button>
        </div>
      </div>
      <div>
        <div className="font-mono text-xs text-neutral-500">{caseNumber}</div>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">{title}</h1>
        <p className="mt-1 text-xs text-neutral-500">报告状态：草稿</p>
      </div>
      {(navigationError || exportError) && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {navigationError ?? exportError}{" "}
          <button type="button" onClick={onRetry} className="underline">
            重试
          </button>
        </div>
      )}
    </section>
  );
}

function EvidenceSelector({
  evidences,
  selectedIds,
  onToggle,
}: {
  evidences: Evidence[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="mt-2 space-y-1.5 border-t border-neutral-100 pt-2">
      {evidences.map((evidence) => (
        <li key={evidence.evidenceId} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={selectedIds.includes(evidence.evidenceId)}
            onChange={() => onToggle(evidence.evidenceId)}
          />
          <div>
            <span className="font-mono text-xs text-neutral-400">
              {evidence.evidenceId}
            </span>{" "}
            <span className="text-xs text-neutral-500">
              {evidenceSourceTypeLabels[evidence.sourceType]} ·{" "}
              {evidence.timestamp
                ? formatDateTimeForDisplay(evidence.timestamp)
                : "（无时间）"}{" "}
              · 关联规则 {evidence.relatedRuleId}
            </span>
            <div className="text-sm text-neutral-900">{evidence.title}</div>
            <div className="text-xs text-neutral-600">{evidence.summary}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportPreview({
  report,
  evidences,
  timeline,
}: {
  report: ReportData;
  evidences: Evidence[];
  timeline: TimelineEvent[];
}) {
  const events = timeline.filter((event) =>
    report.timelineEventIds.includes(event.id),
  );
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-8 py-6">
      <h1 className="text-center text-xl font-bold text-neutral-900">
        数据与网络安全事件调查分析报告
      </h1>
      <p className="mt-1 text-center text-sm text-neutral-500">
        {report.caseNumber}
      </p>
      <h2 className="mt-6 text-base font-semibold">基本信息</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {report.basicInfo.map((row) => (
            <tr key={row.label}>
              <td className="w-32 border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-neutral-500">
                {row.label}
              </td>
              <td className="border border-neutral-200 px-2 py-1.5">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.sections.map((section) => (
        <div key={section.key} className="mt-6">
          <h2 className="text-base font-semibold">{section.title}</h2>
          {section.content.split("\n").map((line, i) => (
            <p key={i} className="mt-1 text-sm leading-6 text-neutral-800">
              {line}
            </p>
          ))}
          {section.key === "evidenceIntro" && (
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr>
                  {["证据编号", "来源", "时间", "摘要", "关联规则"].map((h) => (
                    <th
                      key={h}
                      className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidences.map((e) => (
                  <tr key={e.evidenceId}>
                    <td className="border border-neutral-200 px-2 py-1 font-mono">
                      {e.evidenceId}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {evidenceSourceTypeLabels[e.sourceType]}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {e.timestamp
                        ? formatDateTimeForDisplay(e.timestamp)
                        : "（无时间）"}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {e.summary}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 font-mono">
                      {e.relatedRuleId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {section.key === "timelineIntro" && (
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr>
                  {["时间", "操作人员", "事件类型", "说明"].map((h) => (
                    <th
                      key={h}
                      className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="border border-neutral-200 px-2 py-1 font-mono">
                      {formatDateTimeForDisplay(event.occurredAt)}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {event.operator ??
                        (event.source === "SYSTEM" ? "系统" : "（未填写）")}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {event.eventType}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {event.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
