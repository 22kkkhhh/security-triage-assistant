import type { Evidence, ReportData, TimelineEvent } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildReportData } from "@/services/reporting/reportBuilder";
import {
  mergeChecklistOnRestore,
  toSecurityCaseDraft,
} from "./caseMapper";
import { getCaseById, saveReportDraft } from "./caseRepository";
import type { PersistedCase } from "./types";

export interface ReportWorkbenchContext {
  evidences: Evidence[];
  timeline: TimelineEvent[];
}

export interface ReportDraftBundle {
  caseId: string;
  caseNumber: string;
  title: string;
  report: ReportData;
  /** true = 本次刚生成初稿；false = 加载已有草稿 */
  freshlyCreated: boolean;
  context: ReportWorkbenchContext;
  /** 报告草稿最后保存时间（用于 autosave 展示；非案件 updatedAt） */
  reportUpdatedAt: string | null;
  hasReport: boolean;
  humanRiskLevel: PersistedCase["humanRiskLevel"];
  humanConclusion: PersistedCase["humanConclusion"];
}

export type ReportPageLoad =
  | { status: "not_found" }
  | {
      status: "no_report";
      caseId: string;
      caseNumber: string;
      title: string;
    }
  | { status: "ready"; bundle: ReportDraftBundle };

function toBundle(
  record: PersistedCase,
  report: ReportData,
  freshlyCreated: boolean,
): ReportDraftBundle {
  return {
    caseId: record.id,
    caseNumber: record.caseNumber,
    title: record.title,
    report,
    freshlyCreated,
    context: buildContext(record),
    reportUpdatedAt: record.reportUpdatedAt,
    hasReport: true,
    humanRiskLevel: record.humanRiskLevel,
    humanConclusion: record.humanConclusion,
  };
}

function buildContext(record: PersistedCase): ReportWorkbenchContext {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  return {
    evidences: analyzed.evidences,
    timeline: record.caseState.timeline,
  };
}

/** 从当前案件状态构建初稿（不写入 DB） */
export function buildInitialReportFromRecord(record: PersistedCase): ReportData {
  const draft = toSecurityCaseDraft(record.id, record.caseState);
  const analyzed = analyzeSecurityCase(draft);
  const checklist = mergeChecklistOnRestore(
    record.caseState.checklist,
    analyzed.checklist,
  );
  const report = buildReportData({
    securityCase: {
      ...analyzed,
      checklist,
      humanReview: record.caseState.humanReview,
      timeline: record.caseState.timeline,
    },
    humanReview: record.caseState.humanReview,
    checklist,
    timeline: record.caseState.timeline,
  });
  return {
    ...report,
    caseNumber: record.caseNumber,
    basicInfo: report.basicInfo.map((row) =>
      row.label === "案件编号"
        ? { ...row, value: record.caseNumber }
        : row,
    ),
  };
}

/**
 * 报告页加载：只读，绝不在 GET 时创建 reportDraft。
 */
export async function loadReportPage(caseId: string): Promise<ReportPageLoad> {
  const record = await getCaseById(caseId);
  if (!record) return { status: "not_found" };
  if (!record.reportDraft) {
    return {
      status: "no_report",
      caseId: record.id,
      caseNumber: record.caseNumber,
      title: record.title,
    };
  }
  return {
    status: "ready",
    bundle: toBundle(record, record.reportDraft, false),
  };
}

/**
 * @deprecated v1.2 请使用 createReportDraftCommand。
 * 已有 reportDraft 时绝不覆盖。
 */
export async function getOrCreateReportDraft(
  caseId: string,
): Promise<ReportDraftBundle | null> {
  const record = await getCaseById(caseId);
  if (!record) return null;

  if (record.reportDraft) {
    return toBundle(record, record.reportDraft, false);
  }

  const again = await getCaseById(caseId);
  if (!again) return null;
  if (again.reportDraft) {
    return toBundle(again, again.reportDraft, false);
  }

  const report = buildInitialReportFromRecord(again);
  const beforeWrite = await getCaseById(caseId);
  if (beforeWrite?.reportDraft) {
    return toBundle(beforeWrite, beforeWrite.reportDraft, false);
  }

  const saved = await saveReportDraft(caseId, report);
  return toBundle(saved, saved.reportDraft!, true);
}

/** 仅读取已有报告导出载荷；不存在则失败，绝不临时 buildReportData */
export async function getReportExportPayload(caseId: string): Promise<{
  report: ReportData;
  evidences: Evidence[];
  timeline: TimelineEvent[];
  caseNumber: string;
} | null> {
  const record = await getCaseById(caseId);
  if (!record?.reportDraft) return null;
  const context = buildContext(record);
  return {
    report: record.reportDraft,
    evidences: context.evidences,
    timeline: context.timeline,
    caseNumber: record.caseNumber,
  };
}
