"use client";

import { useMemo, useState } from "react";
import type {
  BusinessContext,
  ChecklistItem,
  HumanReview,
  SecurityCaseDraft,
  TimelineEvent,
} from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import type { ReportSession } from "./report/ReportEditor";
import { BusinessContextPanel } from "./BusinessContextPanel";
import { ChecklistPanel } from "./ChecklistPanel";
import { DimensionPanels } from "./DimensionPanels";
import { EvidencePanel } from "./EvidencePanel";
import { FindingsSummary } from "./FindingsSummary";
import { HumanReviewPanel } from "./HumanReviewPanel";
import { SuggestedAssessmentBar } from "./SuggestedAssessmentBar";
import { TimelinePanel } from "./TimelinePanel";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { Field } from "./common";

export interface WorkbenchCase {
  key: string;
  draft: SecurityCaseDraft;
  hint: string;
}

/**
 * 安全事件研判工作台（Demo）。
 * 业务上下文修改后自动重新运行规则分析；
 * 核查清单与事件时间线补充在未持久化演示路径中仅保存在浏览器 state。
 * 系统建议与人工研判严格分离，系统分析不覆盖 HumanReview。
 */
export function Workbench({
  cases,
  activeKey,
  onSelectCase,
  onExit,
  onGenerateReport,
}: {
  cases: WorkbenchCase[];
  activeKey: string;
  onSelectCase: (key: string) => void;
  onExit: () => void;
  onGenerateReport: (session: ReportSession) => void;
}) {
  const selected = cases.find((option) => option.key === activeKey) ?? cases[0];

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div>
            <div className="text-base font-semibold">
              Security Triage Assistant
            </div>
            <div className="text-xs text-slate-400">
              数据与网络安全联合研判及报告助手 · 演示环境（全部数据为虚构）
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cases.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelectCase(option.key)}
                className={`rounded px-3 py-1.5 text-sm ${
                  selected.key === option.key
                    ? "bg-white text-slate-900"
                    : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                }`}
              >
                {option.draft.name} · {option.hint}
              </button>
            ))}
            <button
              type="button"
              onClick={onExit}
              className="rounded bg-slate-600 px-3 py-1.5 text-sm text-white hover:bg-slate-500"
            >
              新建研判
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-6 py-4">
        <CaseWorkbench
          key={selected.key}
          draft={selected.draft}
          onGenerateReport={onGenerateReport}
        />
      </main>
    </div>
  );
}

function CaseWorkbench({
  draft,
  onGenerateReport,
}: {
  draft: SecurityCaseDraft;
  onGenerateReport: (session: ReportSession) => void;
}) {
  const [businessContext, setBusinessContext] = useState<BusinessContext>(
    draft.businessContext,
  );
  const [humanReview, setHumanReview] = useState<HumanReview>(
    draft.humanReview ?? {
      reviewer: null,
      reviewedByUserId: null,
      finalConclusion: null,
      humanRiskLevel: null,
      conclusionNote: null,
      adjustments: [],
      confirmedAt: null,
    },
  );
  const [checklistOverrides, setChecklistOverrides] = useState<
    Record<string, { completed?: boolean; note?: string | null }>
  >({});
  const [manualItems, setManualItems] = useState<ChecklistItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [humanEvents, setHumanEvents] = useState<TimelineEvent[]>([]);

  // 业务上下文变化时自动重新运行规则分析
  const analyzed = useMemo(
    () => analyzeSecurityCase({ ...draft, businessContext }),
    [draft, businessContext],
  );

  // 系统生成的清单随分析结果更新；人工新增与人工编辑状态保留
  const checklist: ChecklistItem[] = useMemo(() => {
    const merged = [...analyzed.checklist, ...manualItems];
    return merged
      .filter((item) => !deletedIds.includes(item.id))
      .map((item) => ({ ...item, ...checklistOverrides[item.id] }));
  }, [analyzed.checklist, manualItems, deletedIds, checklistOverrides]);

  const timeline = useMemo(
    () => [...draft.timeline, ...humanEvents],
    [draft.timeline, humanEvents],
  );

  const statusText = humanReview.finalConclusion
    ? "已人工确认"
    : "研判中";

  return (
    <>
      <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-neutral-900">
            {draft.name}
          </h1>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              humanReview.finalConclusion
                ? "bg-green-100 text-green-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {statusText}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-6 md:grid-cols-2 lg:grid-cols-4">
          <Field label="案件编号" value={draft.id} />
          <Field label="告警来源" value={draft.alert.source} />
          <Field
            label="告警时间"
            value={formatDateTimeForDisplay(draft.alert.occurredAt)}
          />
          <Field label="告警标题" value={draft.alert.title} />
        </div>
      </section>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
        系统分析仅用于辅助研判，最终结论以安全人员人工确认结果为准。
      </div>

      {analyzed.suggestedAssessment && (
        <SuggestedAssessmentBar assessment={analyzed.suggestedAssessment} />
      )}

      <FindingsSummary results={analyzed.analysisResults} />

      <DimensionPanels securityCase={analyzed} />

      <BusinessContextPanel
        businessContext={businessContext}
        onChange={setBusinessContext}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EvidencePanel evidences={analyzed.evidences} />
        <ChecklistPanel
          items={checklist}
          onToggle={(id) =>
            setChecklistOverrides((prev) => {
              const current = checklist.find((item) => item.id === id);
              return {
                ...prev,
                [id]: { ...prev[id], completed: !current?.completed },
              };
            })
          }
          onEditNote={(id, note) =>
            setChecklistOverrides((prev) => ({
              ...prev,
              [id]: { ...prev[id], note: note || null },
            }))
          }
          onDelete={(id) => setDeletedIds((prev) => [...prev, id])}
          onAdd={(item) => setManualItems((prev) => [...prev, item])}
        />
      </div>

      <HumanReviewPanel humanReview={humanReview} onChange={setHumanReview} />

      <TimelinePanel
        events={timeline}
        onAdd={(event) => setHumanEvents((prev) => [...prev, event])}
      />

      <div className="flex justify-end rounded-md border border-neutral-200 bg-white px-4 py-3">
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700"
          onClick={() =>
            onGenerateReport({
              securityCase: { ...analyzed, humanReview },
              humanReview,
              checklist,
              timeline,
            })
          }
        >
          生成报告
        </button>
      </div>
    </>
  );
}
