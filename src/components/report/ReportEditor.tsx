"use client";

import { useMemo, useState } from "react";
import { evidenceSourceTypeLabels } from "@/domain/labels";
import type {
  ChecklistItem,
  Evidence,
  HumanReview,
  ReportData,
  SecurityCase,
  TimelineEvent,
} from "@/domain/types";
import {
  generateDocxBlob,
  suggestDocxFileName,
} from "@/services/reporting/docxGenerator";
import {
  scanSensitive,
  sensitiveTypeLabels,
  type SensitiveFinding,
} from "@/services/reporting/masking";
import { buildReportData } from "@/services/reporting/reportBuilder";
import {
  formatDateTimeForDisplay,
  formatDateTimesInDisplayText,
} from "@/lib/formatDateTimeForDisplay";
import { Panel } from "../common";

export interface ReportSession {
  securityCase: SecurityCase;
  humanReview: HumanReview | null;
  checklist: ChecklistItem[];
  timeline: TimelineEvent[];
}

/**
 * 报告编辑页面：生成初稿 → 人工编辑 → 预览 → 导出 DOCX。
 * 禁止跳过编辑直接下载。
 */
export function ReportEditor({
  session,
  onBack,
}: {
  session: ReportSession;
  onBack: () => void;
}) {
  const [report, setReport] = useState<ReportData>(() =>
    buildReportData(session),
  );
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [exportFindings, setExportFindings] = useState<SensitiveFinding[] | null>(
    null,
  );

  const selectedEvidences = useMemo(
    () =>
      session.securityCase.evidences.filter((e) =>
        report.evidenceIds.includes(e.evidenceId),
      ),
    [session.securityCase.evidences, report.evidenceIds],
  );

  const reportPlainText = useMemo(() => {
    const parts = [
      report.title,
      ...report.sections.map((s) => s.content),
      ...selectedEvidences.map((e) => `${e.title} ${e.summary}`),
      ...session.timeline
        .filter((event) => report.timelineEventIds.includes(event.id))
        .map((event) => `${event.title} ${event.description}`),
    ];
    return parts.join("\n");
  }, [report, selectedEvidences, session.timeline]);

  const updateSection = (key: string, content: string) =>
    setReport((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.key === key ? { ...s, content } : s,
      ),
    }));

  const toggleEvidence = (evidenceId: string) =>
    setReport((prev) => ({
      ...prev,
      evidenceIds: prev.evidenceIds.includes(evidenceId)
        ? prev.evidenceIds.filter((id) => id !== evidenceId)
        : [...prev.evidenceIds, evidenceId],
    }));

  const handleExportClick = () => {
    const findings = scanSensitive(reportPlainText);
    setExportFindings(findings);
  };

  const doExport = async (maskSensitive: boolean) => {
    const blob = await generateDocxBlob(
      report,
      {
        evidences: session.securityCase.evidences,
        timeline: session.timeline,
      },
      { maskSensitive },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestDocxFileName(report);
    link.click();
    URL.revokeObjectURL(url);
    setExportFindings(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            报告编辑（{report.caseNumber}）
          </h1>
          <p className="text-xs text-neutral-500">
            自动生成的内容仅为初稿，请人工核对并修改后再导出。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            onClick={onBack}
          >
            返回研判工作台
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1.5 text-sm ${
              mode === "preview"
                ? "bg-slate-800 text-white"
                : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "预览" : "继续编辑"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            onClick={handleExportClick}
          >
            导出 DOCX
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <>
          <Panel title="事件名称">
            <input
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              value={report.title}
              onChange={(e) =>
                setReport((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </Panel>

          {report.sections.map((section) => (
            <Panel key={section.key} title={section.title}>
              <textarea
                className="h-28 w-full rounded border border-neutral-300 px-2 py-1 text-sm leading-6"
                value={section.content}
                onChange={(e) => updateSection(section.key, e.target.value)}
              />
              {section.key === "evidenceIntro" && (
                <EvidenceSelector
                  evidences={session.securityCase.evidences}
                  selectedIds={report.evidenceIds}
                  onToggle={toggleEvidence}
                />
              )}
              {section.key === "timelineIntro" && (
                <p className="mt-2 text-xs text-neutral-500">
                  时间线共 {report.timelineEventIds.length} 条，将以结构化表格进入报告。
                </p>
              )}
            </Panel>
          ))}
        </>
      ) : (
        <ReportPreview report={report} evidences={selectedEvidences} timeline={session.timeline} />
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
                    <th key={h} className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidences.map((e) => (
                  <tr key={e.evidenceId}>
                    <td className="border border-neutral-200 px-2 py-1 font-mono">{e.evidenceId}</td>
                    <td className="border border-neutral-200 px-2 py-1">{evidenceSourceTypeLabels[e.sourceType]}</td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {e.timestamp
                        ? formatDateTimeForDisplay(e.timestamp)
                        : "（无时间）"}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {formatDateTimesInDisplayText(e.summary)}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 font-mono">{e.relatedRuleId}</td>
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
                    <th key={h} className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="border border-neutral-200 px-2 py-1 font-mono">{event.occurredAt}</td>
                    <td className="border border-neutral-200 px-2 py-1">
                      {event.operator ?? (event.source === "SYSTEM" ? "系统" : "（未填写）")}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1">{event.eventType}</td>
                    <td className="border border-neutral-200 px-2 py-1">{event.description}</td>
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
