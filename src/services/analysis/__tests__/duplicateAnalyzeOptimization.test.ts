/**
 * M3-01 / M3-01A：消除同一条逻辑链内对相同 persisted state 的重复 analyze，
 * 并证明优化前后安全分析输出完全等价。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { caseB } from "@/domain/demo";
import type { ComplianceReferenceSnapshot } from "@/domain/knowledge";
import * as analyzeModule from "@/services/analysis/analyzeSecurityCase";
import {
  mergeChecklistOnRestore,
  toSecurityCaseDraft,
} from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";

const { loadCaseDetailPageData } = await import(
  "@/app/(app)/cases/loadCaseDetailPageData"
);
const { restoreWorkbenchFromPersisted } = await import(
  "@/services/persistence/restoreWorkbench"
);
const { loadCaseWorkbenchRuntimeViews } = await import(
  "@/app/(app)/cases/loadCaseWorkbenchRuntime"
);
const {
  buildInitialReportFromRecord,
  resolveComplianceSnapshotsForReport,
} = await import("@/services/persistence/reportDraftService");

/** 固定 complianceReferences，避免 Knowledge resolution 时间/环境导致 Report 等价测试变脆。 */
const FIXED_COMPLIANCE_REFERENCES: ComplianceReferenceSnapshot[] = [
  {
    documentId: "doc-1",
    documentVersionId: "ver-1",
    documentCanonicalCode: "PIPL",
    documentTitle: "PIPL",
    versionKey: "2021",
    versionLabel: "2021",
    clauseId: "clause-1",
    clauseKey: "PIPL-38",
    articleNumber: "38",
    clauseHeading: "Frozen clause",
    relationType: "CONTROL_SUPPORT",
    rationaleSnapshot: null,
    sourceUrl: null,
    issuingAuthority: null,
    effectiveDate: "2021-11-01",
    sourceType: "OFFICIAL_PUBLIC",
    capturedAt: "2026-08-09T12:00:00.000Z",
    caseDate: "2026-08-08",
    versionSelectionBasis: "CURRENT_DATE",
    controlId: "ctrl-frozen-1",
    controlCode: "CTRL-FROZEN",
    ruleId: "DATA-001",
    supportingRuleIds: [],
    evidenceIds: [],
    relevance: "DIRECT",
    contentMode: "METADATA_ONLY",
  },
];

function buildPersistedCase(): PersistedCase {
  const analyzed = analyzeModule.analyzeSecurityCase(caseB);
  return {
    id: caseB.id,
    caseNumber: "INC-20260808-002",
    title: caseB.name,
    status: "PENDING_VERIFICATION",
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    humanRiskLevel: caseB.humanReview?.humanRiskLevel ?? null,
    humanConclusion: caseB.humanReview?.finalConclusion ?? null,
    username: caseB.identityContext.accountName,
    sourceIp: caseB.identityContext.loginSourceIp,
    systemsSearchText: caseB.identityContext.accessedSystems.join("|"),
    pendingChecklistCount: analyzed.checklist.filter((item) => !item.completed)
      .length,
    hasReport: false,
    reportUpdatedAt: null,
    lastActivityAt: caseB.createdAt,
    createdAt: caseB.createdAt,
    updatedAt: caseB.createdAt,
    closedAt: null,
    reportDraft: null,
    caseState: {
      caseData: {
        name: caseB.name,
        createdAt: caseB.createdAt,
        alert: caseB.alert,
        dataContext: caseB.dataContext,
        networkContext: caseB.networkContext,
        identityContext: caseB.identityContext,
      },
      businessContext: caseB.businessContext,
      checklist: analyzed.checklist,
      humanReview: caseB.humanReview,
      timeline: caseB.timeline,
    },
  };
}

describe("M3 duplicate analyze optimization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("call-count regression", () => {
    it("Case 详情页加载：同一 record 只 analyze 一次（优化后）", async () => {
      const record = buildPersistedCase();
      const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

      await loadCaseDetailPageData(record);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("Case 详情页加载：旧路径 restore + runtime 会 analyze 两次", async () => {
      const record = buildPersistedCase();
      const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

      restoreWorkbenchFromPersisted(record);
      await loadCaseWorkbenchRuntimeViews(record);

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("报告创建链：resolveCompliance + buildInitial 只 analyze 一次", async () => {
      const record = buildPersistedCase();
      const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

      const analyzed = analyzeModule.analyzeSecurityCase(caseB);
      const complianceReferences = await resolveComplianceSnapshotsForReport(
        record,
        analyzed,
      );
      buildInitialReportFromRecord(record, { complianceReferences, analyzed });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("报告创建链：未传 analyzed 时会重复 analyze（旧行为对照）", async () => {
      const record = buildPersistedCase();
      const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

      const complianceReferences =
        await resolveComplianceSnapshotsForReport(record);
      buildInitialReportFromRecord(record, { complianceReferences });

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Case detail output parity", () => {
    it("optimized.analyzed 与 legacy analyzeSecurityCase 输出等价（含 verificationActions）", async () => {
      const record = buildPersistedCase();
      const { analyzed: optimizedAnalyzed } =
        await loadCaseDetailPageData(record);
      const legacyAnalyzed = analyzeModule.analyzeSecurityCase(
        toSecurityCaseDraft(record.id, record.caseState),
      );

      // verificationActions 嵌套在 analysisResults 内，深比较已覆盖。
      expect(optimizedAnalyzed.analysisResults).toEqual(
        legacyAnalyzed.analysisResults,
      );
      expect(optimizedAnalyzed.evidences).toEqual(legacyAnalyzed.evidences);
      expect(optimizedAnalyzed.checklist).toEqual(legacyAnalyzed.checklist);
      expect(optimizedAnalyzed.suggestedAssessment).toEqual(
        legacyAnalyzed.suggestedAssessment,
      );
    });

    it("optimized.initial 与 restoreWorkbenchFromPersisted 完整输出一致", async () => {
      const record = buildPersistedCase();
      const optimized = await loadCaseDetailPageData(record);
      const legacy = restoreWorkbenchFromPersisted(record);

      // RestoredWorkbenchView 无与优化无关的瞬时字段；updatedAt 来自 persisted record。
      expect(optimized.initial).toEqual(legacy);
    });
  });

  describe("Report output parity", () => {
    it("传 analyzed vs 内部 analyze 产出的 ReportData 完全一致", () => {
      const record = buildPersistedCase();
      const draft = toSecurityCaseDraft(record.id, record.caseState);
      const analyzed = analyzeModule.analyzeSecurityCase(draft);
      const reportOptions = {
        complianceReferences: FIXED_COMPLIANCE_REFERENCES,
      };
      const fixedGeneratedAt = "2026-08-10T12:00:00.000Z";

      vi.useFakeTimers();
      vi.setSystemTime(new Date(fixedGeneratedAt));
      try {
        const legacyReport = buildInitialReportFromRecord(record, reportOptions);
        const optimizedReport = buildInitialReportFromRecord(record, {
          ...reportOptions,
          analyzed,
        });

        expect(optimizedReport).toEqual(legacyReport);
        expect(optimizedReport.generatedAt).toBe(fixedGeneratedAt);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Structured BC output parity", () => {
    it("useMemo 单路径 checklist 与旧双 analyze checklist 一致", () => {
      const analyzedBase = analyzeModule.analyzeSecurityCase(caseB);
      const checklistBase = analyzedBase.checklist;
      const nextBusinessContext = {
        ...caseB.businessContext,
        plannedTaskStatus: "CONFIRMED" as const,
      };

      const legacyExplicit = mergeChecklistOnRestore(
        checklistBase,
        analyzeModule.analyzeSecurityCase({
          ...caseB,
          businessContext: nextBusinessContext,
        }).checklist,
      );

      const singleAnalyze = mergeChecklistOnRestore(
        checklistBase,
        analyzeModule.analyzeSecurityCase({
          ...caseB,
          businessContext: nextBusinessContext,
          humanReview: caseB.humanReview,
          timeline: caseB.timeline,
        }).checklist,
      );

      expect(singleAnalyze).toEqual(legacyExplicit);
    });

    it("next state 的 analysisResults / evidences / suggestedAssessment 与旧显式 analyze 路径一致", () => {
      const nextBusinessContext = {
        ...caseB.businessContext,
        plannedTaskStatus: "CONFIRMED" as const,
      };

      const legacyAnalyzed = analyzeModule.analyzeSecurityCase({
        ...caseB,
        businessContext: nextBusinessContext,
      });

      const singlePathAnalyzed = analyzeModule.analyzeSecurityCase({
        ...caseB,
        businessContext: nextBusinessContext,
        humanReview: caseB.humanReview,
        timeline: caseB.timeline,
      });

      expect(singlePathAnalyzed.analysisResults).toEqual(
        legacyAnalyzed.analysisResults,
      );
      expect(singlePathAnalyzed.evidences).toEqual(legacyAnalyzed.evidences);
      expect(singlePathAnalyzed.suggestedAssessment).toEqual(
        legacyAnalyzed.suggestedAssessment,
      );
    });
  });
});
