import type { Evidence, ReportData, TimelineEvent } from "@/domain/types";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildReportData } from "@/services/reporting/reportBuilder";
import {
  mergeChecklistOnRestore,
  toSecurityCaseDraft,
} from "./caseMapper";
import {
  getCaseById,
  saveReportDraft,
} from "./caseRepository";
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

function buildInitialReport(record: PersistedCase): ReportData {
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
  // 使用 CaseRecord 稳定案件编号，覆盖报告构建器基于草稿 id 的临时编号
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
 * 获取或首次创建报告草稿。
 * 已有 reportDraft 时绝不调用 buildReportData 覆盖人工编辑。
 */
export async function getOrCreateReportDraft(
  caseId: string,
): Promise<ReportDraftBundle | null> {
  const record = await getCaseById(caseId);
  if (!record) return null;

  if (record.reportDraft) {
    return toBundle(record, record.reportDraft, false);
  }

  // 并发保护：生成前再次读取，若已有草稿则直接返回
  const again = await getCaseById(caseId);
  if (!again) return null;
  if (again.reportDraft) {
    return toBundle(again, again.reportDraft, false);
  }

  const report = buildInitialReport(again);
  // 写入前再读一次，避免双写覆盖
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
