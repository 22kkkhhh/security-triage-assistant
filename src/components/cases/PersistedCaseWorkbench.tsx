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
import {
  addTimelineEventAction,
  applyChecklistCommandAction,
  changeCaseStatusAction,
  updateBusinessContextAction,
  updateHumanReviewAction,
} from "@/app/(app)/cases/commandActions";
import { createReportDraftAction } from "@/app/(app)/cases/reportActions";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  hasStructuredBusinessContextChange,
  hasStructuredHumanReviewChange,
} from "@/services/caseCommands/structuredDiff";
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
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";
import {
  CaseActivityPanel,
  type CaseActivityPanelHandle,
} from "./CaseActivityPanel";
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
 * 持久化案件工作台：恢复 caseState → 本地编辑 → 自动保存 / 语义命令。
 * 分析结果现场派生；SuggestedAssessment 不覆盖 HumanReview。
 */
export function PersistedCaseWorkbench({
  initial,
  hasReport = false,
  initialAudit,
}: {
  initial: RestoredWorkbenchView;
  hasReport?: boolean;
  initialAudit?: {
    items: CaseAuditLogView[];
    nextCursor: string | null;
    hasMore: boolean;
    latestHandoff: CaseAuditLogView | null;
  };
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
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const activityPanelRef = useRef<CaseActivityPanelHandle>(null);

  /** Command 返回的 Audit 局部合并进 Feed，避免 router.refresh 冲掉未保存输入 */
  const mergeReturnedAudit = useCallback((audit: CaseAuditLogView | null) => {
    if (audit) activityPanelRef.current?.prependAudit(audit);
  }, []);

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

  const applyCanonicalState = useCallback(
    (payload: {
      status: CaseStatus;
      caseState: {
        businessContext: BusinessContext;
        humanReview: HumanReview | null;
        checklist: ChecklistItem[];
        timeline: TimelineEvent[];
      };
    }) => {
      setStatus(payload.status);
      setBusinessContext(payload.caseState.businessContext);
      setHumanReview(payload.caseState.humanReview ?? emptyHumanReview());
      setChecklistBase(payload.caseState.checklist);
      setTimeline(payload.caseState.timeline);
      const nextAnalyzed = analyzeSecurityCase({
        ...draftBase,
        businessContext: payload.caseState.businessContext,
        humanReview: payload.caseState.humanReview,
        timeline: payload.caseState.timeline,
      });
      payloadRef.current = {
        status: payload.status,
        businessContext: payload.caseState.businessContext,
        humanReview: payload.caseState.humanReview ?? emptyHumanReview(),
        checklist: payload.caseState.checklist,
        timeline: payload.caseState.timeline,
        suggestedRiskLevel:
          nextAnalyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      };
    },
    [draftBase],
  );

  const {
    saveState,
    scheduleSave,
    flushSave,
    retrySave,
    cancelPendingSave,
    commitExternalSave,
    getPersistedUpdatedAt,
  } = useCaseAutosave({
    caseId: initial.caseId,
    getPayload,
    initialSavedAt: initial.updatedAt,
    onStale: (payload) => {
      applyCanonicalState({
        status: payload.status,
        caseState: payload.caseState,
      });
      setStaleNotice("案件已发生更新，已刷新到最新状态。");
      setCommandError(null);
    },
  });

  type CommandActionResult = Awaited<
    ReturnType<typeof changeCaseStatusAction>
  >;

  /** STALE：恢复服务器 canonical，不回滚到本地点击前旧状态 */
  const applyCommandStale = (result: Extract<CommandActionResult, { ok: false }>) => {
    if (
      result.code !== "STALE" ||
      !result.updatedAt ||
      !result.caseState ||
      !result.status
    ) {
      return false;
    }
    cancelPendingSave();
    applyCanonicalState({
      status: result.status,
      caseState: result.caseState,
    });
    commitExternalSave(result.updatedAt);
    setStaleNotice("案件已发生更新，已刷新到最新状态。");
    setCommandError(null);
    return true;
  };

  const handleBusinessContextChange = (next: BusinessContext) => {
    const prevBc = businessContext;
    const prevChecklistBase = checklistBase;
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
    const structured = hasStructuredBusinessContextChange(
      businessContext,
      next,
    );

    setBusinessContext(next);
    setChecklistBase(nextChecklist);
    payloadRef.current = {
      ...payloadRef.current,
      businessContext: next,
      checklist: nextChecklist,
      suggestedRiskLevel:
        nextAnalyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    };

    if (!structured) {
      const isTextHeavy =
        next.businessJustification !== prevBc.businessJustification ||
        next.changeTicketId !== prevBc.changeTicketId ||
        next.businessOwner !== prevBc.businessOwner;
      scheduleSave(isTextHeavy ? "debounce" : "immediate");
      return;
    }

    const operationId = crypto.randomUUID();
    const baseUpdatedAt = getPersistedUpdatedAt();
    cancelPendingSave();
    setCommandError(null);
    void (async () => {
      const result = await updateBusinessContextAction(
        initial.caseId,
        operationId,
        getPayload(),
        baseUpdatedAt,
      );
      if (!result.ok) {
        if (applyCommandStale(result)) return;
        setBusinessContext(prevBc);
        setChecklistBase(prevChecklistBase);
        payloadRef.current = {
          ...payloadRef.current,
          businessContext: prevBc,
          checklist: mergeChecklistOnRestore(
            prevChecklistBase,
            analyzeSecurityCase({
              ...draftBase,
              businessContext: prevBc,
              humanReview,
              timeline,
            }).checklist,
          ),
        };
        setCommandError(result.error || "业务核查信息更新失败，请重试。");
        return;
      }
      commitExternalSave(result.updatedAt);
      mergeReturnedAudit(result.audit);
    })();
  };

  const handleHumanReviewChange = (next: HumanReview) => {
    const prev = humanReview;
    const structured = hasStructuredHumanReviewChange(humanReview, next);
    setHumanReview(next);
    payloadRef.current = { ...payloadRef.current, humanReview: next };

    if (!structured) {
      const noteChanged =
        next.conclusionNote !== prev.conclusionNote ||
        next.reviewer !== prev.reviewer;
      scheduleSave(noteChanged ? "debounce" : "immediate");
      return;
    }

    const operationId = crypto.randomUUID();
    const baseUpdatedAt = getPersistedUpdatedAt();
    cancelPendingSave();
    setCommandError(null);
    void (async () => {
      const result = await updateHumanReviewAction(
        initial.caseId,
        operationId,
        getPayload(),
        baseUpdatedAt,
      );
      if (!result.ok) {
        if (applyCommandStale(result)) return;
        setHumanReview(prev);
        payloadRef.current = { ...payloadRef.current, humanReview: prev };
        setCommandError(result.error || "人工研判更新失败，请重试。");
        return;
      }
      commitExternalSave(result.updatedAt);
      mergeReturnedAudit(result.audit);
    })();
  };

  const handleStatusChange = (next: CaseStatus) => {
    const prev = status;
    setStatus(next);
    payloadRef.current = { ...payloadRef.current, status: next };
    const operationId = crypto.randomUUID();
    const baseUpdatedAt = getPersistedUpdatedAt();
    cancelPendingSave();
    setCommandError(null);
    void (async () => {
      const result = await changeCaseStatusAction(
        initial.caseId,
        next,
        operationId,
        getPayload(),
        baseUpdatedAt,
      );
      if (!result.ok) {
        if (applyCommandStale(result)) return;
        setStatus(prev);
        payloadRef.current = { ...payloadRef.current, status: prev };
        setCommandError(result.error || "状态修改失败，请重试。");
        return;
      }
      commitExternalSave(result.updatedAt);
      mergeReturnedAudit(result.audit);
    })();
  };

  const runChecklistCommand = (
    action: "complete" | "reopen" | "add" | "delete",
    itemId: string,
    nextChecklist: ChecklistItem[],
    prevChecklistBase: ChecklistItem[],
  ) => {
    setChecklistBase(nextChecklist);
    payloadRef.current = { ...payloadRef.current, checklist: nextChecklist };
    const operationId = crypto.randomUUID();
    const baseUpdatedAt = getPersistedUpdatedAt();
    cancelPendingSave();
    setCommandError(null);
    void (async () => {
      const result = await applyChecklistCommandAction(
        initial.caseId,
        action,
        itemId,
        operationId,
        getPayload(),
        baseUpdatedAt,
      );
      if (!result.ok) {
        if (applyCommandStale(result)) return;
        setChecklistBase(prevChecklistBase);
        payloadRef.current = {
          ...payloadRef.current,
          checklist: prevChecklistBase,
        };
        setCommandError(result.error || "核查项更新失败，请重试。");
        return;
      }
      commitExternalSave(result.updatedAt);
      mergeReturnedAudit(result.audit);
    })();
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

  const createReportOperationIdRef = useRef<string | null>(null);

  const goToReport = async () => {
    setNavigationError(null);
    setCommandError(null);
    if (
      saveState.status === "DIRTY" ||
      saveState.status === "SAVING" ||
      saveState.status === "ERROR"
    ) {
      const ok = await flushSave();
      if (!ok) {
        setNavigationError("保存失败，请重试后再进入报告。");
        return;
      }
    }

    if (hasReport) {
      router.push(`/cases/${initial.caseId}/report`);
      return;
    }

    if (!createReportOperationIdRef.current) {
      createReportOperationIdRef.current = crypto.randomUUID();
    }
    try {
      const result = await createReportDraftAction(
        initial.caseId,
        createReportOperationIdRef.current,
      );
      if (!result.ok) {
        setCommandError(result.error || "报告初稿生成失败，请重试。");
        return;
      }
      commitExternalSave(result.updatedAt);
      router.push(`/cases/${initial.caseId}/report`);
    } catch {
      setCommandError("报告初稿生成失败，请重试。");
    }
  };

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

      {staleNotice && (
        <div className="rounded border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {staleNotice}
          <button
            type="button"
            className="ml-3 underline underline-offset-2"
            onClick={() => setStaleNotice(null)}
          >
            关闭
          </button>
        </div>
      )}

      {commandError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {commandError}
          <button
            type="button"
            className="ml-3 underline underline-offset-2"
            onClick={() => setCommandError(null)}
          >
            关闭
          </button>
        </div>
      )}

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
            const current = checklist.find((item) => item.id === id);
            if (!current) return;
            const prevBase = checklistBase;
            const next = checklist.map((item) =>
              item.id === id
                ? { ...item, completed: !item.completed }
                : item,
            );
            runChecklistCommand(
              current.completed ? "reopen" : "complete",
              id,
              next,
              prevBase,
            );
          }}
          onEditNote={(id, note) => {
            const next = checklist.map((item) =>
              item.id === id ? { ...item, note: note || null } : item,
            );
            setChecklistBase(next);
            payloadRef.current = { ...payloadRef.current, checklist: next };
            scheduleSave("debounce");
          }}
          onDelete={(id) => {
            const prevBase = checklistBase;
            const next = checklist.filter((item) => item.id !== id);
            runChecklistCommand("delete", id, next, prevBase);
          }}
          onAdd={(item) => {
            const prevBase = checklistBase;
            const next = [...checklist, item];
            runChecklistCommand("add", item.id, next, prevBase);
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
          const prev = timeline;
          const next = [...timeline, event];
          setTimeline(next);
          payloadRef.current = { ...payloadRef.current, timeline: next };
          const operationId = crypto.randomUUID();
          const baseUpdatedAt = getPersistedUpdatedAt();
          cancelPendingSave();
          setCommandError(null);
          void (async () => {
            const result = await addTimelineEventAction(
              initial.caseId,
              event.id,
              operationId,
              getPayload(),
              baseUpdatedAt,
            );
            if (!result.ok) {
              if (applyCommandStale(result)) return;
              setTimeline(prev);
              payloadRef.current = { ...payloadRef.current, timeline: prev };
              setCommandError(result.error || "时间线事件添加失败，请重试。");
              return;
            }
            commitExternalSave(result.updatedAt);
            mergeReturnedAudit(result.audit);
          })();
        }}
      />

      <CaseActivityPanel
        ref={activityPanelRef}
        caseId={initial.caseId}
        initialItems={initialAudit?.items ?? []}
        initialNextCursor={initialAudit?.nextCursor ?? null}
        initialHasMore={initialAudit?.hasMore ?? false}
        initialLatestHandoff={initialAudit?.latestHandoff ?? null}
        onCaseRowUpdated={(updatedAt) => {
          // Handoff 会触摸 CaseRecord（@updatedAt），同步 base token
          commitExternalSave(updatedAt);
        }}
      />

      <div className="flex justify-end rounded-md border border-neutral-200 bg-white px-4 py-3">
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700"
          onClick={() => void goToReport()}
        >
          {hasReport ? "继续编辑报告" : "生成报告"}
        </button>
      </div>
    </div>
  );
}
