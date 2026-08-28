"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { evidenceSourceTypeLabels } from "@/domain/labels";
import type { Evidence, ReportData, TimelineEvent } from "@/domain/types";
import { exportReportAction } from "@/app/(app)/cases/reportActions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import {
  scanSensitive,
  sensitiveTypeLabels,
  type SensitiveFinding,
} from "@/services/reporting/masking";
import { useReportAutosave } from "@/hooks/useReportAutosave";
import {
  formatDateTimeForDisplay,
  formatDateTimesInDisplayText,
} from "@/lib/formatDateTimeForDisplay";
import type { AutosaveState } from "@/hooks/autosaveState";
import { actionClass, pageWidth } from "@/components/layout/pageChrome";
import type { ReportPageCapabilities } from "@/domain/uiCapabilities";
import type { ReportDraftBundle } from "@/services/persistence/reportDraftService";

/**
 * 持久化报告编辑器：以 reportDraft 为唯一 Source of Truth。
 * capabilities 控制 UX；无写权限时不启动 autosave、默认预览。
 */
export function PersistedReportEditor({
  bundle,
  capabilities,
}: {
  bundle: ReportDraftBundle;
  capabilities: ReportPageCapabilities;
}) {
  const router = useRouter();
  const [report, setReport] = useState<ReportData>(bundle.report);
  const reportRef = useRef(report);
  const canWrite = capabilities.canWrite;
  const canExport = capabilities.canExport;

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  const [mode, setMode] = useState<"edit" | "preview">(
    canWrite ? "edit" : "preview",
  );
  const [exportFindings, setExportFindings] = useState<SensitiveFinding[] | null>(
    null,
  );
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const exportOperationIdRef = useRef<string | null>(null);

  const getReport = useCallback(() => reportRef.current, []);
  const { saveState, scheduleSave, flushSave, retrySave, isStaleLocked } =
    useReportAutosave({
      caseId: bundle.caseId,
      getReport,
      initialSavedAt: bundle.reportUpdatedAt,
      onStale: () => {
        setStaleNotice(
          "报告已在其他页面发生更新。为避免覆盖，请刷新后重新确认内容。",
        );
      },
    });

  const commitReport = (
    next: ReportData,
    modeSave: "debounce" | "immediate",
  ) => {
    if (!canWrite) return;
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
      canWrite &&
      (saveState.status === "DIRTY" ||
        saveState.status === "SAVING" ||
        saveState.status === "ERROR")
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
    if (!canExport) {
      setExportError("当前账号无权限导出报告");
      return;
    }
    setExportError(null);
    if (
      canWrite &&
      (saveState.status === "DIRTY" ||
        saveState.status === "SAVING" ||
        saveState.status === "ERROR")
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
    if (!canExport) return;
    if (!exportOperationIdRef.current) {
      exportOperationIdRef.current = crypto.randomUUID();
    }
    try {
      const result = await exportReportAction(
        bundle.caseId,
        exportOperationIdRef.current,
        maskSensitive,
      );
      if (!result.ok) {
        setExportError(
          actionErrorMessage(result, "Word 报告导出失败，请重试。"),
        );
        setExportFindings(null);
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
      setExportFindings(null);
      exportOperationIdRef.current = null;
    } catch {
      setExportError("Word 报告导出失败，请重试。");
      setExportFindings(null);
    }
  };

  return (
    <div className={`${pageWidth.document} space-y-4`}>
      <ReportHeader
        caseNumber={bundle.caseNumber}
        title={report.title || bundle.title}
        saveState={saveState}
        navigationError={navigationError}
        exportError={exportError}
        canWrite={canWrite}
        canExport={canExport}
        onBack={() => void handleBack()}
        onRetry={() => {
          setNavigationError(null);
          setExportError(null);
          if (canWrite && !isStaleLocked()) void retrySave();
        }}
        onExport={() => void handleExportClick()}
        mode={mode}
        onToggleMode={() => {
          if (!canWrite) return;
          setMode(mode === "edit" ? "preview" : "edit");
        }}
      />

      {!canWrite && (
        <p className="text-sm text-neutral-600">
          只读模式：可查看报告内容，但不能编辑或自动保存。
        </p>
      )}

      <div className="border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-950">
        <span className="font-medium">自动带入：</span>
        案件事实、核查项、时间线和关键证据会复用到报告中；人工主要补充事件名称、研判结论和整改建议。
      </div>

      {staleNotice && (
        <div className="border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {staleNotice}
          <button
            type="button"
            className="ml-3 underline underline-offset-2"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      )}

      {mode === "edit" && canWrite ? (
        <div className="border border-neutral-200 bg-white px-5 py-5 sm:px-8">
          <section className="pb-5">
            <h2 className="text-sm font-semibold text-neutral-900">事件名称</h2>
            <input
              className="mt-2 w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-1.5 text-base text-neutral-900 focus:border-slate-500 focus:outline-none"
              value={report.title}
              onChange={(e) =>
                commitReport({ ...report, title: e.target.value }, "debounce")
              }
            />
          </section>

          {report.sections.map((section) => (
            <section
              key={section.key}
              className="border-t border-neutral-100 py-5"
            >
              <h2 className="text-sm font-semibold text-neutral-900">
                {section.title}
              </h2>
              <textarea
                className="mt-2 h-28 w-full resize-y border-0 bg-transparent px-0 py-1 text-sm leading-7 text-neutral-800 focus:outline-none"
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
                <p className="mt-1 text-xs text-neutral-500">
                  时间线共 {report.timelineEventIds.length}{" "}
                  条，将以结构化表格进入报告。
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <ReportPreview
          report={report}
          evidences={selectedEvidences}
          timeline={bundle.context.timeline}
        />
      )}

      {exportFindings !== null && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-export-confirm-title"
        >
          <div className="w-full max-w-lg border border-neutral-200 bg-white p-5">
            <h2
              id="report-export-confirm-title"
              className="text-base font-semibold text-neutral-900"
            >
              {exportFindings.length > 0
                ? "报告中检测到可能的敏感信息，请确认导出方式"
                : "未检测到明显敏感信息，确认导出"}
            </h2>
            {exportFindings.length > 0 && (
              <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                {exportFindings.map((finding, index) => (
                  <li key={index}>
                    <span className="font-medium">
                      {sensitiveTypeLabels[finding.type]}
                    </span>
                    ：
                    <span className="font-mono">{finding.value}</span>
                    {" → "}
                    <span className="font-mono">{finding.masked}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={actionClass.secondary}
                onClick={() => setExportFindings(null)}
              >
                取消
              </button>
              {exportFindings.length > 0 && (
                <button
                  type="button"
                  className={actionClass.secondary}
                  onClick={() => void doExport(false)}
                >
                  保持原值导出
                </button>
              )}
              <button
                type="button"
                className={actionClass.primary}
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
  canWrite,
  canExport,
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
  canWrite: boolean;
  canExport: boolean;
  onBack: () => void;
  onRetry: () => void;
  onExport: () => void;
  mode: "edit" | "preview";
  onToggleMode: () => void;
}) {
  const savedLabel = (() => {
    if (!canWrite) return "只读";
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
    <section className="space-y-3 border-b border-neutral-200 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className={actionClass.tertiary}>
          ← 返回案件
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              saveState.status === "ERROR" && canWrite
                ? "text-sm text-red-700"
                : "text-sm text-neutral-500"
            }
          >
            {savedLabel}
          </span>
          {canWrite && saveState.status === "ERROR" && (
            <button
              type="button"
              onClick={onRetry}
              className={actionClass.danger}
            >
              重试
            </button>
          )}
          {canWrite ? (
            <button
              type="button"
              className={actionClass.secondary}
              onClick={onToggleMode}
            >
              {mode === "edit" ? "预览" : "继续编辑"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canExport}
            title={canExport ? "导出 Word 报告" : "当前账号无权限导出报告"}
            aria-disabled={!canExport}
            className={actionClass.primary}
            onClick={onExport}
          >
            导出 Word
          </button>
        </div>
      </div>
      <div>
        <div className="font-mono text-xs text-neutral-500">{caseNumber}</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          {canWrite ? "报告状态：草稿" : "报告状态：只读查看"}
        </p>
        {!canExport ? (
          <p className="mt-1 text-xs text-neutral-500">
            当前账号无权限导出报告
          </p>
        ) : null}
      </div>
      {(navigationError || exportError) && (
        <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {navigationError ?? exportError}{" "}
          {canWrite ? (
            <button type="button" onClick={onRetry} className="underline">
              重试
            </button>
          ) : null}
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
            <div className="text-xs text-neutral-600">
              {formatDateTimesInDisplayText(evidence.summary)}
            </div>
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
    <div className="border border-neutral-200 bg-white px-5 py-8 sm:px-10">
      <h1 className="text-center text-xl font-semibold tracking-tight text-neutral-900">
        数据与网络安全事件调查分析报告
      </h1>
      <p className="mt-2 text-center font-mono text-sm text-neutral-500">
        {report.caseNumber}
      </p>
      <h2 className="mt-8 text-base font-semibold text-neutral-900">基本信息</h2>
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
                      {formatDateTimesInDisplayText(e.summary)}
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
