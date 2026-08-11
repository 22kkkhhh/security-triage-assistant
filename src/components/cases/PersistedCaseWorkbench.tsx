"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BusinessContext,
  CaseStatus,
  ChecklistItem,
  HumanReview,
  TimelineEvent,
} from "@/domain/types";
import {
  addInvestigationLeadToChecklistAction,
  addTimelineEventAction,
  applyChecklistCommandAction,
  assignCaseAction,
  changeCaseStatusAction,
  updateBusinessContextAction,
  updateHumanReviewAction,
} from "@/app/(app)/cases/commandActions";
import type { UserRole } from "@/domain/auth";
import type {
  CaseAssigneeSummary,
  CaseOwnership,
} from "@/domain/caseOwnership";
import { createReportDraftAction } from "@/app/(app)/cases/reportActions";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  hasStructuredBusinessContextChange,
  hasStructuredHumanReviewChange,
} from "@/services/caseCommands/structuredDiff";
import { mergeChecklistOnRestore } from "@/services/persistence/caseMapper";
import type { RestoredWorkbenchView } from "@/services/persistence/restoreWorkbench";
import type {
  CaseComplianceChecklistItem,
  CaseComplianceChecklistView,
} from "@/services/knowledge/caseComplianceChecklist";
import type { CaseCompliancePanelView } from "@/services/knowledge/caseCompliancePanel";
import {
  createChecklistItemFromComplianceSuggestion,
  hasSuggestionInChecklist,
} from "@/services/checklist/fromComplianceSuggestion";
import {
  hasInvestigationLeadInChecklist,
} from "@/services/checklist/fromInvestigationLead";
import {
  investigationLeadKey,
  isInvestigationLeadCode,
} from "@/services/checklist/investigationLeadCanonical";
import { useCaseAutosave } from "@/hooks/useCaseAutosave";
import {
  BusinessContextPanel,
  businessContextFieldNeedsAttention,
} from "@/components/BusinessContextPanel";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { DimensionPanels } from "@/components/DimensionPanels";
import { EvidencePanel } from "@/components/EvidencePanel";
import { FindingsSummary } from "@/components/FindingsSummary";
import { HumanReviewPanel } from "@/components/HumanReviewPanel";
import { SuggestedAssessmentBar } from "@/components/SuggestedAssessmentBar";
import { TimelinePanel } from "@/components/TimelinePanel";
import { Field } from "@/components/common";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";
import type { CaseWorkbenchCapabilities } from "@/domain/uiCapabilities";
import { isCaseWorkbenchReadOnly } from "@/domain/uiCapabilities";
import {
  CaseActivityPanel,
  type CaseActivityPanelHandle,
} from "./CaseActivityPanel";
import { CaseComplianceChecklistPanel } from "./CaseComplianceChecklistPanel";
import {
  CaseCompliancePanel,
  type ComplianceResolutionStatus,
} from "./CaseCompliancePanel";
import { CaseHeader } from "./CaseHeader";
import { CaseInvestigationNav } from "./CaseInvestigationNav";
import { InvestigationProgressPanel } from "./InvestigationProgressPanel";
import { InvestigationStepSection } from "./InvestigationStepSection";
import { deriveInvestigationOverviewStats } from "./investigationOverviewStats";
import {
  INVESTIGATION_SECTION_IDS,
  toInvestigationProgressPanelView,
  type InvestigationProgressViewDto,
} from "./investigationProgressSummary";
import { RelatedCasesPanel } from "./RelatedCasesPanel";
import { WorkbenchSection } from "./WorkbenchSection";
import type { InvestigationIntelligenceView } from "@/services/correlation/investigationIntelligenceTypes";

function countBusinessContextPending(ctx: BusinessContext): number {
  const fields: (keyof BusinessContext)[] = [
    "plannedTaskStatus",
    "changeTicketStatus",
    "changeTicketId",
    "businessOwner",
    "ownerVerification",
    "businessLegitimacy",
    "businessJustification",
  ];
  return fields.filter((field) =>
    businessContextFieldNeedsAttention(field, ctx),
  ).length;
}

const emptyHumanReview = (): HumanReview => ({
  reviewer: null,
  reviewedByUserId: null,
  finalConclusion: null,
  humanRiskLevel: null,
  conclusionNote: null,
  adjustments: [],
  confirmedAt: null,
});

/**
 * 持久化案件工作台：恢复 caseState → 本地编辑 → 自动保存 / 语义命令。
 * capabilities 仅控制 UX 呈现；Server Authorization 仍是最终安全边界。
 */
export function PersistedCaseWorkbench({
  initial,
  hasReport = false,
  initialAudit,
  capabilities,
  currentUserId,
  currentUserRole,
  eligibleAssignees = [],
  compliancePanel,
  complianceChecklist,
  complianceResolutionStatus,
  investigationProgress,
  investigationIntelligence = {
    relatedCases: [],
    relatedCaseCount: 0,
    signals: [],
    leads: [],
  },
}: {
  initial: RestoredWorkbenchView;
  hasReport?: boolean;
  initialAudit?: {
    items: CaseAuditLogView[];
    nextCursor: string | null;
    hasMore: boolean;
    latestHandoff: CaseAuditLogView | null;
  };
  capabilities: CaseWorkbenchCapabilities;
  currentUserId: string;
  currentUserRole: UserRole;
  eligibleAssignees?: CaseAssigneeSummary[];
  /** 服务端已解析的合规参考视图；前端只读展示 */
  compliancePanel: CaseCompliancePanelView;
  /** 服务端聚合的建议核查事项；只读，不写回 ChecklistItem */
  complianceChecklist: CaseComplianceChecklistView;
  /**
   * SUCCESS = resolver 正常 resolve（含真实零 findings）；
   * RESOLUTION_UNAVAILABLE = resolver 失败，UI 不得展示与「真实零 findings」相同文案。
   */
  complianceResolutionStatus: ComplianceResolutionStatus;
  /** 服务端 Investigation Progress 投影；Client 不自行 resolve */
  investigationProgress: InvestigationProgressViewDto;
  /** Related Cases → Signals → Leads；只读，不改风险 / HumanReview */
  investigationIntelligence?: InvestigationIntelligenceView;
}) {
  const router = useRouter();
  const readOnly = isCaseWorkbenchReadOnly(capabilities);

  /**
   * Context 已成功持久化后：软刷新 Server Component，
   * 由案件详情页服务端 loader 重算合规面板、建议清单与 Investigation Progress。
   * Client 不执行 compliance / progress resolver；刷新完成前保留旧 props。
   */
  const refreshComplianceAfterContextPersist = useCallback(() => {
    router.refresh();
  }, [router]);

  const [status, setStatus] = useState<CaseStatus>(initial.status);
  const [ownership, setOwnership] = useState<CaseOwnership>(initial.ownership);
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
  const [pendingSuggestionKey, setPendingSuggestionKey] = useState<
    string | null
  >(null);
  const [pendingLeadKey, setPendingLeadKey] = useState<string | null>(null);
  /** 语义命令飞行中（与 Snapshot autosave 状态分离） */
  const [commandPending, setCommandPending] = useState(false);
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

  /** STALE / 命令成功后回填服务端 canonical 状态 */
  const applyCanonicalState = useCallback(
    (payload: {
      status: CaseStatus;
      caseState: {
        businessContext: BusinessContext;
        humanReview: HumanReview | null;
        checklist: ChecklistItem[];
        timeline: TimelineEvent[];
      };
      ownership?: CaseOwnership;
    }) => {
      setStatus(payload.status);
      setBusinessContext(payload.caseState.businessContext);
      setHumanReview(payload.caseState.humanReview ?? emptyHumanReview());
      setChecklistBase(payload.caseState.checklist);
      setTimeline(payload.caseState.timeline);
      if (payload.ownership) setOwnership(payload.ownership);
    },
    [],
  );

  const {
    saveState,
    scheduleSave: scheduleSaveRaw,
    flushSave,
    retrySave,
    cancelPendingSave,
    commitExternalSave,
    beginSemanticCommand,
    endSemanticCommand,
  } = useCaseAutosave({
    caseId: initial.caseId,
    initialSavedAt: initial.updatedAt,
    onStale: (payload) => {
      applyCanonicalState({
        status: payload.status,
        caseState: payload.caseState,
      });
      setStaleNotice("案件已发生更新，已刷新到最新状态。");
      setCommandError(null);
      // 服务端 canonical 已变：重拉合规 runtime 视图
      refreshComplianceAfterContextPersist();
    },
    onSaved: (patch) => {
      // 仅 businessContext Snapshot 字段会影响 compliance context keys
      if (patch.businessContext) {
        refreshComplianceAfterContextPersist();
      }
    },
  });

  /** VIEWER：禁止 Snapshot autosave（含误触 onChange） */
  const scheduleSave: typeof scheduleSaveRaw = useCallback(
    (mode, patch) => {
      if (!capabilities.canSnapshotWrite) return;
      scheduleSaveRaw(mode, patch);
    },
    [capabilities.canSnapshotWrite, scheduleSaveRaw],
  );

  type CommandActionResult = Awaited<ReturnType<typeof changeCaseStatusAction>>;

  /** Snapshot 未能落盘时不发送语义命令；用户输入保留，保存错误仍由顶栏展示 */
  const SNAPSHOT_BLOCKED_MESSAGE =
    "尚有未保存内容保存失败，已取消本次操作，请先重试保存。";

  /** STALE：恢复服务器 canonical，不回滚到本地点击前旧状态 */
  const applyCommandStale = (
    result: Extract<CommandActionResult, { ok: false }>,
  ) => {
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
      ownership: result.ownership,
    });
    commitExternalSave(result.updatedAt);
    setStaleNotice("案件已发生更新，已刷新到最新状态。");
    setCommandError(null);
    refreshComplianceAfterContextPersist();
    return true;
  };

  const handleBusinessContextChange = (next: BusinessContext) => {
    const structured = hasStructuredBusinessContextChange(
      businessContext,
      next,
    );
    if (structured && !capabilities.canWriteBusinessContext) return;
    if (!structured && !capabilities.canSnapshotWrite) return;

    const prevBc = businessContext;
    setBusinessContext(next);

    if (!structured) {
      const isTextHeavy =
        next.businessJustification !== prevBc.businessJustification ||
        next.changeTicketId !== prevBc.changeTicketId ||
        next.businessOwner !== prevBc.businessOwner;
      scheduleSave(isTextHeavy ? "debounce" : "immediate", {
        businessContext: {
          businessJustification: next.businessJustification,
          changeTicketId: next.changeTicketId,
          businessOwner: next.businessOwner,
        },
      });
      return;
    }

    const operationId = crypto.randomUUID();
    setCommandError(null);
    setCommandPending(true);
    void (async () => {
      const rollback = () => {
        setBusinessContext(prevBc);
      };
      const lease = await beginSemanticCommand();
      if (!lease.ok) {
        rollback();
        setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
        setCommandPending(false);
        return;
      }
      try {
        const result = await updateBusinessContextAction(
          initial.caseId,
          operationId,
          lease.baseUpdatedAt,
          {
            plannedTaskStatus: next.plannedTaskStatus,
            changeTicketStatus: next.changeTicketStatus,
            ownerVerification: next.ownerVerification,
            businessLegitimacy: next.businessLegitimacy,
          },
        );
        if (!result.ok) {
          if (applyCommandStale(result)) return;
          rollback();
          setCommandError(
            actionErrorMessage(result, "业务核查信息更新失败，请重试。"),
          );
          return;
        }
        commitExternalSave(result.updatedAt);
        mergeReturnedAudit(result.audit);
        refreshComplianceAfterContextPersist();
      } finally {
        endSemanticCommand();
        setCommandPending(false);
      }
    })();
  };

  const handleHumanReviewChange = (next: HumanReview) => {
    const structured = hasStructuredHumanReviewChange(humanReview, next);
    if (structured && !capabilities.canWriteHumanReview) return;
    if (!structured && !capabilities.canSnapshotWrite) return;

    const prev = humanReview;
    setHumanReview(next);

    if (!structured) {
      const noteChanged = next.conclusionNote !== prev.conclusionNote;
      if (noteChanged) {
        scheduleSave("debounce", {
          humanReview: {
            conclusionNote: next.conclusionNote,
          },
        });
      }
      return;
    }

    const operationId = crypto.randomUUID();
    setCommandError(null);
    setCommandPending(true);
    void (async () => {
      const lease = await beginSemanticCommand();
      if (!lease.ok) {
        setHumanReview(prev);
        setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
        setCommandPending(false);
        return;
      }
      try {
        const result = await updateHumanReviewAction(
          initial.caseId,
          operationId,
          {
            finalConclusion: next.finalConclusion,
            humanRiskLevel: next.humanRiskLevel,
          },
          lease.baseUpdatedAt,
        );
        if (!result.ok) {
          if (applyCommandStale(result)) return;
          setHumanReview(prev);
          setCommandError(
            actionErrorMessage(result, "人工研判更新失败，请重试。"),
          );
          return;
        }
        const serverHr = result.caseState.humanReview ?? emptyHumanReview();
        setHumanReview(serverHr);
        commitExternalSave(result.updatedAt);
        mergeReturnedAudit(result.audit);
        refreshComplianceAfterContextPersist();
      } finally {
        endSemanticCommand();
        setCommandPending(false);
      }
    })();
  };

  const handleStatusChange = (next: CaseStatus) => {
    if (!capabilities.canChangeStatus) return;
    const prev = status;
    setStatus(next);
    const operationId = crypto.randomUUID();
    setCommandError(null);
    setCommandPending(true);
    void (async () => {
      const lease = await beginSemanticCommand();
      if (!lease.ok) {
        setStatus(prev);
        setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
        setCommandPending(false);
        return;
      }
      try {
        const result = await changeCaseStatusAction(
          initial.caseId,
          next,
          operationId,
          lease.baseUpdatedAt,
        );
        if (!result.ok) {
          if (applyCommandStale(result)) return;
          setStatus(prev);
          setCommandError(actionErrorMessage(result, "状态修改失败，请重试。"));
          return;
        }
        if (result.ownership) setOwnership(result.ownership);
        commitExternalSave(result.updatedAt);
        mergeReturnedAudit(result.audit);
      } finally {
        endSemanticCommand();
        setCommandPending(false);
      }
    })();
  };

  const handleAssign = (targetUserId: string | null) => {
    if (!capabilities.canAssignCase) return;
    if (ownership.assignedToUserId === targetUserId) return;
    const prev = ownership;
    const operationId = crypto.randomUUID();
    setCommandError(null);
    setCommandPending(true);
    void (async () => {
      const lease = await beginSemanticCommand();
      if (!lease.ok) {
        setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
        setCommandPending(false);
        return;
      }
      try {
        const result = await assignCaseAction(
          initial.caseId,
          targetUserId,
          operationId,
          lease.baseUpdatedAt,
        );
        if (!result.ok) {
          if (applyCommandStale(result)) return;
          setOwnership(prev);
          setCommandError(
            actionErrorMessage(result, "案件负责人更新失败，请重试。"),
          );
          return;
        }
        setOwnership(result.ownership);
        commitExternalSave(result.updatedAt);
        mergeReturnedAudit(result.audit);
      } finally {
        endSemanticCommand();
        setCommandPending(false);
      }
    })();
  };

  /** add 才发送 minimal intent；complete / reopen / delete 只发送 action + itemId */
  const toChecklistAddIntent = (item: ChecklistItem) => {
    const intent = {
      id: item.id,
      category: item.category,
      label: item.label,
      note: item.note ?? null,
    };
    if (item.sourceKind === "KNOWLEDGE_SUGGESTED" && item.sourceRef) {
      return {
        ...intent,
        sourceKind: "KNOWLEDGE_SUGGESTED" as const,
        sourceRef: item.sourceRef,
      };
    }
    return intent;
  };

  const runChecklistCommand = (
    action: "complete" | "reopen" | "add" | "delete",
    itemId: string,
    nextChecklist: ChecklistItem[],
    prevChecklistBase: ChecklistItem[],
    options?: { suggestionKey?: string; addItem?: ChecklistItem },
  ) => {
    setChecklistBase(nextChecklist);
    if (options?.suggestionKey) {
      setPendingSuggestionKey(options.suggestionKey);
    }
    const operationId = crypto.randomUUID();
    setCommandError(null);
    setCommandPending(true);
    void (async () => {
      const lease = await beginSemanticCommand();
      if (!lease.ok) {
        setChecklistBase(prevChecklistBase);
        if (options?.suggestionKey) {
          setPendingSuggestionKey(null);
        }
        setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
        setCommandPending(false);
        return;
      }
      try {
        const result = await applyChecklistCommandAction(
          initial.caseId,
          action,
          itemId,
          operationId,
          lease.baseUpdatedAt,
          action === "add" && options?.addItem
            ? toChecklistAddIntent(options.addItem)
            : undefined,
        );
        if (options?.suggestionKey) {
          setPendingSuggestionKey(null);
        }
        if (!result.ok) {
          if (applyCommandStale(result)) return;
          setChecklistBase(prevChecklistBase);
          setCommandError(
            actionErrorMessage(result, "核查项更新失败，请重试。"),
          );
          return;
        }
        // 幂等已加入：以服务端 canonical checklist 为准
        if (result.caseState?.checklist) {
          setChecklistBase(result.caseState.checklist);
        }
        commitExternalSave(result.updatedAt);
        mergeReturnedAudit(result.audit);
        refreshComplianceAfterContextPersist();
      } finally {
        endSemanticCommand();
        setCommandPending(false);
      }
    })();
  };

  const addedSuggestionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of checklist) {
      const key = item.sourceRef?.suggestionKey;
      if (item.sourceKind === "KNOWLEDGE_SUGGESTED" && key) {
        keys.add(key);
      }
    }
    return keys;
  }, [checklist]);

  const acceptedLeadKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of checklist) {
      const key = item.sourceRef?.leadKey;
      if (item.sourceKind === "INVESTIGATION_LEAD" && key) {
        keys.add(key);
      }
    }
    return keys;
  }, [checklist]);

  const addInvestigationLeadToChecklist = (leadCode: string) => {
    if (!isInvestigationLeadCode(leadCode)) return;
    const leadKey = investigationLeadKey(leadCode);
    if (hasInvestigationLeadInChecklist(checklist, leadKey)) return;
    setPendingLeadKey(leadKey);
    setCommandError(null);
    setCommandPending(true);
    const operationId = crypto.randomUUID();
    void (async () => {
      const lease = await beginSemanticCommand();
      if (!lease.ok) {
        setPendingLeadKey(null);
        setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
        setCommandPending(false);
        return;
      }
      try {
        const result = await addInvestigationLeadToChecklistAction(
          initial.caseId,
          leadCode,
          operationId,
          lease.baseUpdatedAt,
        );
        if (!result.ok) {
          if (applyCommandStale(result)) return;
          setCommandError(
            actionErrorMessage(result, "加入核查清单失败，请重试。"),
          );
          return;
        }
        if (result.caseState?.checklist) {
          setChecklistBase(result.caseState.checklist);
        }
        commitExternalSave(result.updatedAt);
        mergeReturnedAudit(result.audit);
        refreshComplianceAfterContextPersist();
      } finally {
        endSemanticCommand();
        setPendingLeadKey(null);
        setCommandPending(false);
      }
    })();
  };

  /** M3C：Server Progress DTO → 展示模型（不做 Client 侧 OPEN/RESOLVED 推导） */
  const investigationProgressView = useMemo(
    () => toInvestigationProgressPanelView(investigationProgress),
    [investigationProgress],
  );

  /** M3 Overview：前端派生计数，仅展示，不落库 */
  const overviewStats = useMemo(
    () =>
      deriveInvestigationOverviewStats({
        analysisResults: analyzed.analysisResults,
        checklist,
        suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel,
      }),
    [
      analyzed.analysisResults,
      analyzed.suggestedAssessment?.suggestedRiskLevel,
      checklist,
    ],
  );

  const handleAddComplianceSuggestion = (
    suggestion: CaseComplianceChecklistItem,
  ) => {
    if (!capabilities.canWriteChecklist) return;
    if (hasSuggestionInChecklist(checklistBase, suggestion.key)) return;
    const prevBase = checklistBase;
    const created = createChecklistItemFromComplianceSuggestion(suggestion);
    const next = [...checklistBase, created];
    runChecklistCommand("add", created.id, next, prevBase, {
      suggestionKey: suggestion.key,
      addItem: created,
    });
  };

  const handleBack = async () => {
    setNavigationError(null);
    // 由 flushSave 判定是否仍有未落盘编辑，不依赖瞬时 UI 状态
    if (capabilities.canSnapshotWrite) {
      const ok = await flushSave();
      if (!ok) {
        setNavigationError("保存失败，请重试后返回案件队列。");
        return;
      }
    }
    router.push("/cases");
  };

  const createReportOperationIdRef = useRef<string | null>(null);

  const goToReport = async () => {
    setNavigationError(null);
    setCommandError(null);
    if (capabilities.canSnapshotWrite) {
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

    if (!capabilities.canWriteReport) {
      setCommandError("该案件尚未生成调查报告。");
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
        setCommandError(
          actionErrorMessage(result, "报告初稿生成失败，请重试。"),
        );
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
        commandPending={commandPending}
        navigationError={navigationError}
        canChangeStatus={capabilities.canChangeStatus}
        readOnly={readOnly}
        ownership={ownership}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        canAssignCase={capabilities.canAssignCase}
        eligibleAssignees={eligibleAssignees}
        onAssign={handleAssign}
        onStatusChange={handleStatusChange}
        onRetry={() => {
          setNavigationError(null);
          void retrySave();
        }}
        onBack={() => void handleBack()}
      />

      {readOnly && (
        <div className="rounded border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          只读模式：可查看案件内容与操作记录，但不能修改。
        </div>
      )}

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

      <CaseInvestigationNav />

      {/* A. 概览 */}
      <InvestigationProgressPanel
        view={investigationProgressView}
        overviewStats={overviewStats}
        relatedCaseCount={investigationIntelligence.relatedCaseCount}
        hasReport={hasReport}
        canWriteReport={capabilities.canWriteReport}
        onGoToReport={() => void goToReport()}
      />

      <details
        className="border-b border-neutral-100 pb-3"
        data-testid="case-basic-info"
      >
        <summary className="cursor-pointer text-sm text-neutral-600">
          案件信息
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 pt-1 md:grid-cols-2 lg:grid-cols-4">
          <Field label="案件编号" value={initial.caseNumber} />
          <Field label="告警来源" value={draftBase.alert.source} />
          <Field
            label="告警时间"
            value={formatDateTimeForDisplay(draftBase.alert.occurredAt)}
          />
          <Field label="告警标题" value={draftBase.alert.title} />
        </div>
      </details>

      {/* B. 调查（四步固定顺序） */}
      <WorkbenchSection
        id={INVESTIGATION_SECTION_IDS.investigation}
        title="调查"
        description="按顺序完成业务确认、核查、历史线索与最终研判"
        testId="investigation-workspace"
        aria-label="调查"
      >
        <InvestigationStepSection
          id={INVESTIGATION_SECTION_IDS.businessContext}
          step={1}
          title="业务确认"
          description="确认任务、工单与业务负责人"
          statusLabel={
            countBusinessContextPending(businessContext) > 0
              ? `待补充 ${countBusinessContextPending(businessContext)}`
              : "已填写"
          }
        >
          <BusinessContextPanel
            businessContext={businessContext}
            onChange={handleBusinessContextChange}
            canWriteStructured={capabilities.canWriteBusinessContext}
            canWriteSnapshot={capabilities.canSnapshotWrite}
            saveState={saveState}
            commandPending={commandPending}
            onRetrySave={retrySave}
          />
        </InvestigationStepSection>

        <InvestigationStepSection
          id={INVESTIGATION_SECTION_IDS.evidenceWorkspace}
          step={2}
          title="证据与核查"
          description="完成当前调查任务"
          statusLabel={
            overviewStats.pendingChecklistCount > 0
              ? `${overviewStats.pendingChecklistCount} 项待处理`
              : "无待处理"
          }
          testId="evidence-checklist-workspace"
        >
          <div
            id={INVESTIGATION_SECTION_IDS.checklist}
            className="scroll-mt-14 min-w-0"
          >
            <ChecklistPanel
              items={checklist}
              canWrite={capabilities.canWriteChecklist}
              canEditNote={capabilities.canSnapshotWrite}
              onToggle={(id) => {
                if (!capabilities.canWriteChecklist) return;
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
                if (!capabilities.canSnapshotWrite) return;
                const next = checklist.map((item) =>
                  item.id === id ? { ...item, note: note || null } : item,
                );
                setChecklistBase(next);
                scheduleSave("debounce", {
                  checklistNotes: [{ checklistId: id, note: note || null }],
                });
              }}
              onDelete={(id) => {
                if (!capabilities.canWriteChecklist) return;
                const prevBase = checklistBase;
                const next = checklist.filter((item) => item.id !== id);
                runChecklistCommand("delete", id, next, prevBase);
              }}
              onAdd={(item) => {
                if (!capabilities.canWriteChecklist) return;
                const prevBase = checklistBase;
                const next = [...checklist, item];
                runChecklistCommand("add", item.id, next, prevBase, {
                  addItem: item,
                });
              }}
            />
          </div>
          <details className="mt-3" data-testid="evidence-disclosure">
            <summary className="cursor-pointer text-sm text-neutral-600">
              查看系统证据（{analyzed.evidences.length}）
            </summary>
            <div
              id={INVESTIGATION_SECTION_IDS.evidence}
              className="scroll-mt-14 mt-2 min-w-0"
            >
              <EvidencePanel evidences={analyzed.evidences} />
            </div>
          </details>
        </InvestigationStepSection>

        <InvestigationStepSection
          step={3}
          title="历史线索"
          description="查看重复事实与历史调查"
          statusLabel={
            investigationIntelligence.relatedCaseCount > 0
              ? `${investigationIntelligence.relatedCaseCount} 个相关案件`
              : "暂无相关"
          }
        >
          <RelatedCasesPanel
            intelligence={investigationIntelligence}
            currentCaseId={initial.caseId}
            canWriteChecklist={capabilities.canWriteChecklist}
            acceptedLeadKeys={acceptedLeadKeys}
            pendingLeadKey={pendingLeadKey}
            onAddLeadToChecklist={addInvestigationLeadToChecklist}
          />
        </InvestigationStepSection>

        <InvestigationStepSection
          id={INVESTIGATION_SECTION_IDS.humanReview}
          step={4}
          title="最终研判"
          description="由安全人员确认最终结论"
          statusLabel={
            investigationProgressView.humanReviewSubmitted
              ? "已提交"
              : "未完成"
          }
          testId="human-review-workspace"
        >
          {overviewStats.pendingChecklistCount > 0 ||
          overviewStats.unknownCount > 0 ? (
            <p className="mb-2 text-xs text-neutral-600">
              {overviewStats.pendingChecklistCount > 0
                ? `当前还有 ${overviewStats.pendingChecklistCount} 项待核查`
                : null}
              {overviewStats.pendingChecklistCount > 0 &&
              overviewStats.unknownCount > 0
                ? " · "
                : null}
              {overviewStats.unknownCount > 0
                ? `当前还有 ${overviewStats.unknownCount} 项信息不足`
                : null}
            </p>
          ) : null}
          <p className="mb-2 text-xs text-neutral-500">
            最终结论由安全人员确认 · 系统建议不会自动写入
          </p>
          <HumanReviewPanel
            humanReview={humanReview}
            onChange={handleHumanReviewChange}
            canWriteSemantic={capabilities.canWriteHumanReview}
            canWriteNote={capabilities.canSnapshotWrite}
            outstandingWorkHint={investigationProgressView.hasOutstandingWork}
            investigationProgressUnavailable={
              investigationProgressView.isResolutionUnavailable
            }
          />
        </InvestigationStepSection>
      </WorkbenchSection>

      {/* C. 分析（次要工作区，默认折叠详情） */}
      <WorkbenchSection
        id={INVESTIGATION_SECTION_IDS.analysis}
        title="分析"
        description="系统建议与合规参考 · 不替代人工最终研判"
        aria-label="分析"
      >
        {analyzed.suggestedAssessment ? (
          <div className="space-y-1">
            <p className="text-xs text-neutral-500">系统建议 · 非最终结论</p>
            <SuggestedAssessmentBar
              assessment={analyzed.suggestedAssessment}
            />
          </div>
        ) : null}

        <details
          className="border-t border-neutral-100 pt-2"
          data-testid="system-analysis-details"
        >
          <summary className="cursor-pointer text-sm font-medium text-neutral-800">
            系统分析
            <span className="ml-2 font-normal text-neutral-500">
              {overviewStats.abnormalCount} 异常 · {overviewStats.unknownCount}{" "}
              信息不足
            </span>
          </summary>
          <div className="mt-3 space-y-4">
            <FindingsSummary results={analyzed.analysisResults} />
            <DimensionPanels securityCase={analyzed} />
          </div>
        </details>

        <details
          className="border-t border-neutral-100 pt-2"
          data-testid="compliance-reference-details"
        >
          <summary className="cursor-pointer text-sm font-medium text-neutral-800">
            合规参考
            <span className="ml-2 font-normal text-neutral-500">
              辅助参考 · 非法律结论
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            <div
              id={INVESTIGATION_SECTION_IDS.compliance}
              className="scroll-mt-14"
            >
              <CaseCompliancePanel
                view={compliancePanel}
                resolutionStatus={complianceResolutionStatus}
              />
            </div>
            <div
              id={INVESTIGATION_SECTION_IDS.complianceChecklist}
              className="scroll-mt-14"
            >
              <CaseComplianceChecklistPanel
                view={complianceChecklist}
                addedSuggestionKeys={addedSuggestionKeys}
                canWrite={capabilities.canWriteChecklist}
                pendingSuggestionKey={pendingSuggestionKey}
                onAddSuggestion={handleAddComplianceSuggestion}
                resolutionStatus={complianceResolutionStatus}
              />
            </div>
          </div>
        </details>
      </WorkbenchSection>

      {/* D. 记录 */}
      <WorkbenchSection
        id={INVESTIGATION_SECTION_IDS.records}
        title="记录"
        description="调查时间线与操作审计"
        aria-label="记录"
      >
        <details open data-testid="timeline-details">
          <summary className="cursor-pointer text-sm font-medium text-neutral-800">
            调查时间线
          </summary>
          <div className="mt-2">
            <TimelinePanel
              events={timeline}
              canAdd={capabilities.canWriteTimeline}
              onAdd={(event) => {
                if (!capabilities.canWriteTimeline) return;
                const prev = timeline;
                const next = [...timeline, event];
                setTimeline(next);
                const operationId = crypto.randomUUID();
                setCommandError(null);
                setCommandPending(true);
                void (async () => {
                  const lease = await beginSemanticCommand();
                  if (!lease.ok) {
                    setTimeline(prev);
                    setCommandError(SNAPSHOT_BLOCKED_MESSAGE);
                    setCommandPending(false);
                    return;
                  }
                  try {
                    const result = await addTimelineEventAction(
                      initial.caseId,
                      event.id,
                      operationId,
                      lease.baseUpdatedAt,
                      {
                        id: event.id,
                        occurredAt: event.occurredAt,
                        eventType: event.eventType,
                        title: event.title,
                        description: event.description,
                        operator: event.operator,
                      },
                    );
                    if (!result.ok) {
                      if (applyCommandStale(result)) return;
                      setTimeline(prev);
                      setCommandError(
                        actionErrorMessage(
                          result,
                          "时间线事件添加失败，请重试。",
                        ),
                      );
                      return;
                    }
                    commitExternalSave(result.updatedAt);
                    mergeReturnedAudit(result.audit);
                  } finally {
                    endSemanticCommand();
                    setCommandPending(false);
                  }
                })();
              }}
            />
          </div>
        </details>

        <details data-testid="activity-details">
          <summary className="cursor-pointer text-sm font-medium text-neutral-800">
            操作与审计
          </summary>
          <div className="mt-2">
            <CaseActivityPanel
              ref={activityPanelRef}
              caseId={initial.caseId}
              initialItems={initialAudit?.items ?? []}
              initialNextCursor={initialAudit?.nextCursor ?? null}
              initialHasMore={initialAudit?.hasMore ?? false}
              initialLatestHandoff={initialAudit?.latestHandoff ?? null}
              canWriteHandoff={capabilities.canWriteHandoff}
              onCaseRowUpdated={(updatedAt) => {
                commitExternalSave(updatedAt);
              }}
            />
          </div>
        </details>
      </WorkbenchSection>

      {/* E. Report — 次级动作，避免与 Next Step 同级大按钮 */}
      <div
        className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 pt-3"
        data-testid="case-report-cta"
      >
        {hasReport ? (
          <button
            type="button"
            className="text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900"
            onClick={() => void goToReport()}
          >
            {capabilities.canWriteReport ? "继续编辑报告" : "查看报告"}
          </button>
        ) : capabilities.canWriteReport ? (
          <button
            type="button"
            className="text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900"
            onClick={() => void goToReport()}
          >
            生成报告
          </button>
        ) : (
          <p className="text-sm text-neutral-500">该案件尚未生成调查报告。</p>
        )}
      </div>
    </div>
  );
}
