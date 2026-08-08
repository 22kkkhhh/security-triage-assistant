"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BusinessContext,
  CaseStatus,
  ChecklistItem,
  HumanReview,
  RiskLevel,
  TimelineEvent,
} from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { mergeChecklistOnRestore } from "@/services/persistence/caseMapper";
import type { RestoredWorkbenchView } from "@/services/persistence/restoreWorkbench";
import { useCaseAutosave } from "@/hooks/useCaseAutosave";
import { BusinessContextPanel } from "@/components/BusinessContextPanel";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { DimensionPanels } from "@/components/DimensionPanels";
import { EvidencePanel } from "@/components/EvidencePanel";
import { FindingsSummary } from "@/components/FindingsSummary";
import { HumanReviewPanel } from "@/components/HumanReviewPanel";
import { SuggestedAssessmentBar } from "@/components/SuggestedAssessmentBar";
import { TimelinePanel } from "@/components/TimelinePanel";
import { Field } from "@/components/common";
import { ReportEditor, type ReportSession } from "@/components/report/ReportEditor";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { CaseHeader } from "./CaseHeader";

const emptyHumanReview = (): HumanReview => ({
  reviewer: null,
  finalConclusion: null,
  humanRiskLevel: null,
  conclusionNote: null,
  adjustments: [],
  confirmedAt: null,
});

type LivePayload = {
  status: CaseStatus;
  businessContext: BusinessContext;
  humanReview: HumanReview;
  checklist: ChecklistItem[];
  timeline: TimelineEvent[];
  suggestedRiskLevel: RiskLevel | null;
};

/**
 * 持久化案件工作台：恢复 caseState → 本地编辑 → 自动保存。
 * 分析结果现场派生；SuggestedAssessment 不覆盖 HumanReview。
 */
export function PersistedCaseWorkbench({
  initial,
}: {
  initial: RestoredWorkbenchView;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CaseStatus>(initial.status);
  const [businessContext, setBusinessContext] = useState<BusinessContext>(
    initial.draft.businessContext,
  );
  const [humanReview, setHumanReview] = useState<HumanReview>(
    initial.draft.humanReview ?? emptyHumanReview(),
  );
  const [checklistBase, setChecklistBase] = useState<ChecklistItem[]>(
    initial.initialChecklist,
  );
  const [timeline, setTimeline] = useState<TimelineEvent[]>(
    initial.draft.timeline,
  );
  const [reportSession, setReportSession] = useState<ReportSession | null>(
    null,
  );
  const [navigationError, setNavigationError] = useState<string | null>(null);

  const draftBase = initial.draft;

  const analyzed = useMemo(
    () =>
      analyzeSecurityCase({
        ...draftBase,
        businessContext,
        humanReview,
        timeline,
      }),
    [draftBase, businessContext, humanReview, timeline],
  );

  const checklist = useMemo(
    () => mergeChecklistOnRestore(checklistBase, analyzed.checklist),
    [checklistBase, analyzed.checklist],
  );

  const payloadRef = useRef<LivePayload>({
    status: initial.status,
    businessContext: initial.draft.businessContext,
    humanReview: initial.draft.humanReview ?? emptyHumanReview(),
    checklist: initial.initialChecklist,
    timeline: initial.draft.timeline,
    suggestedRiskLevel: initial.suggestedRiskLevel,
  });

  // 与渲染结果对齐；事件 handler 内也会同步写入，保证 immediate 保存读到最新值
  useEffect(() => {
    payloadRef.current = {
      status,
      businessContext,
      humanReview,
      checklist,
      timeline,
      suggestedRiskLevel:
        analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    };
  }, [
    status,
    businessContext,
    humanReview,
    checklist,
    timeline,
    analyzed.suggestedAssessment?.suggestedRiskLevel,
  ]);

  const getPayload = useCallback(
    () => ({
      caseData: {
        name: draftBase.name,
        createdAt: draftBase.createdAt,
        alert: draftBase.alert,
        dataContext: draftBase.dataContext,
        networkContext: draftBase.networkContext,
        identityContext: draftBase.identityContext,
      },
      businessContext: payloadRef.current.businessContext,
      checklist: payloadRef.current.checklist,
      humanReview: payloadRef.current.humanReview,
      timeline: payloadRef.current.timeline,
      suggestedRiskLevel: payloadRef.current.suggestedRiskLevel,
      status: payloadRef.current.status,
    }),
    [draftBase],
  );

  const { saveState, scheduleSave, flushSave, retrySave } = useCaseAutosave({
    caseId: initial.caseId,
    getPayload,
    initialSavedAt: initial.updatedAt,
  });

  const handleBusinessContextChange = (next: BusinessContext) => {
    setBusinessContext(next);
    const nextAnalyzed = analyzeSecurityCase({
      ...draftBase,
      businessContext: next,
      humanReview,
      timeline,
    });
    const nextChecklist = mergeChecklistOnRestore(
      checklistBase,
      nextAnalyzed.checklist,
    );
    setChecklistBase(nextChecklist);
    payloadRef.current = {
      ...payloadRef.current,
      businessContext: next,
      checklist: nextChecklist,
      suggestedRiskLevel:
        nextAnalyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    };
    const isTextHeavy =
      next.businessJustification !== businessContext.businessJustification ||
      next.changeTicketId !== businessContext.changeTicketId ||
      next.businessOwner !== businessContext.businessOwner;
    scheduleSave(isTextHeavy ? "debounce" : "immediate");
  };

  const handleHumanReviewChange = (next: HumanReview) => {
    setHumanReview(next);
    payloadRef.current = { ...payloadRef.current, humanReview: next };
    const noteChanged =
      next.conclusionNote !== humanReview.conclusionNote ||
      next.reviewer !== humanReview.reviewer;
    scheduleSave(noteChanged ? "debounce" : "immediate");
  };

  const handleStatusChange = (next: CaseStatus) => {
    setStatus(next);
    payloadRef.current = { ...payloadRef.current, status: next };
    scheduleSave("immediate");
  };

  const commitChecklist = (
    next: ChecklistItem[],
    mode: "immediate" | "debounce",
  ) => {
    setChecklistBase(next);
    payloadRef.current = { ...payloadRef.current, checklist: next };
    scheduleSave(mode);
  };

  const handleBack = async () => {
    setNavigationError(null);
    if (
      saveState.status === "DIRTY" ||
      saveState.status === "SAVING" ||
      saveState.status === "ERROR"
    ) {
      const ok = await flushSave();
      if (!ok) {
        setNavigationError("保存失败，请重试后返回历史案件。");
        return;
      }
    }
    router.push("/cases");
  };

  if (reportSession) {
    return (
      <ReportEditor
        session={reportSession}
        onBack={() => setReportSession(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <CaseHeader
        caseNumber={initial.caseNumber}
        title={draftBase.name}
        status={status}
        humanRiskLevel={humanReview.humanRiskLevel}
        suggestedRiskLevel={
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null
        }
        saveState={saveState}
        navigationError={navigationError}
        onStatusChange={handleStatusChange}
        onRetry={() => {
          setNavigationError(null);
          void retrySave();
        }}
        onBack={() => void handleBack()}
      />

      <section className="rounded-md border border-neutral-200 bg-white px-4 py-3">
        <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2 lg:grid-cols-4">
          <Field label="案件编号" value={initial.caseNumber} />
          <Field label="告警来源" value={draftBase.alert.source} />
          <Field
            label="告警时间"
            value={formatDateTimeForDisplay(draftBase.alert.occurredAt)}
          />
          <Field label="告警标题" value={draftBase.alert.title} />
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
        onChange={handleBusinessContextChange}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EvidencePanel evidences={analyzed.evidences} />
        <ChecklistPanel
          items={checklist}
          onToggle={(id) => {
            commitChecklist(
              checklist.map((item) =>
                item.id === id
                  ? { ...item, completed: !item.completed }
                  : item,
              ),
              "immediate",
            );
          }}
          onEditNote={(id, note) => {
            commitChecklist(
              checklist.map((item) =>
                item.id === id ? { ...item, note: note || null } : item,
              ),
              "debounce",
            );
          }}
          onDelete={(id) => {
            commitChecklist(
              checklist.filter((item) => item.id !== id),
              "immediate",
            );
          }}
          onAdd={(item) => {
            commitChecklist([...checklist, item], "immediate");
          }}
        />
      </div>

      <HumanReviewPanel
        humanReview={humanReview}
        onChange={handleHumanReviewChange}
      />

      <TimelinePanel
        events={timeline}
        onAdd={(event) => {
          const next = [...timeline, event];
          setTimeline(next);
          payloadRef.current = { ...payloadRef.current, timeline: next };
          scheduleSave("immediate");
        }}
      />

      <div className="flex justify-end rounded-md border border-neutral-200 bg-white px-4 py-3">
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700"
          onClick={() =>
            setReportSession({
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
    </div>
  );
}
