/**
 * v1.5 M4 Workstream C1 — Core Correctness Hardening regression。
 */
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type { ComplianceReferenceSnapshot } from "@/domain/knowledge";
import { resolveInvestigationProgress } from "@/domain/investigationProgress";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  createReportDraftCommand,
  saveReportDraftCommand,
} from "@/services/caseCommands/reportCommands";
import { updateBusinessContextCommand } from "@/services/caseCommands";
import { applyBusinessContextCompletion, generateChecklist } from "@/services/checklist/generateChecklist";
import { resetPrismaClient } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import type { PersistedCase, SaveCaseStateInput } from "@/services/persistence/types";
import {
  createCase,
  getCaseById,
  saveReportDraft,
  StaleReportDraftError,
} from "@/services/persistence/caseRepository";
import { preserveFrozenComplianceReferences } from "@/services/persistence/reportDraftIntegrity";
import { loadCaseComplianceWorkbenchRuntime } from "@/services/knowledge/loadCaseCompliancePanel";
import { loadCaseWorkbenchRuntimeViews } from "@/app/(app)/cases/loadCaseWorkbenchRuntime";
import * as resolveCaseComplianceModule from "@/services/knowledge/resolveCaseCompliance";
import { vi } from "vitest";

const TEST_DB_FILE = path.resolve("prisma/test-core-correctness-hardening.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

const FROZEN_SNAPSHOT: ComplianceReferenceSnapshot[] = [
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

function toNextState(
  record: PersistedCase,
  patch: Partial<SaveCaseStateInput>,
): SaveCaseStateInput {
  return {
    caseData: record.caseState.caseData,
    businessContext: record.caseState.businessContext,
    checklist: record.caseState.checklist,
    humanReview: record.caseState.humanReview,
    timeline: record.caseState.timeline,
    suggestedRiskLevel: record.suggestedRiskLevel,
    status: record.status,
    ...patch,
  };
}

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function seedCase(draft = caseA) {
  const analyzed = analyzeSecurityCase(draft);
  return createCase({
    draft,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
}

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
  await resetPrismaClient(TEST_DB_URL);
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("SF-1 frozen complianceReferences", () => {
  it("客户端修改 complianceReferences 时 server 保留冻结 Snapshot", async () => {
    const created = await seedCase();
    const createdReport = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-c1-create",
      actor: systemActor(),
    });
    expect(createdReport.ok).toBe(true);
    if (!createdReport.ok) return;

    const serverDraft = createdReport.case.reportDraft!;
    const withFrozen = {
      ...serverDraft,
      complianceReferences: FROZEN_SNAPSHOT,
    };
    await saveReportDraft(created.id, withFrozen);

    const tampered = {
      ...withFrozen,
      title: "客户端改标题",
      complianceReferences: [],
    };
    const saved = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: tampered,
      baseReportUpdatedAt: (await getCaseById(created.id))!.reportUpdatedAt,
      actor: systemActor(),
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.case.reportDraft?.complianceReferences).toEqual(FROZEN_SNAPSHOT);
    expect(saved.case.reportDraft?.title).toBe("客户端改标题");
  });

  it("preserveFrozenComplianceReferences 单元：替换/删除均被拒绝", () => {
    const server = {
      title: "t",
      caseNumber: "INC-1",
      basicInfo: [],
      sections: [],
      evidenceIds: [],
      timelineEventIds: [],
      generatedAt: "2026-08-09T12:00:00.000Z",
      complianceReferences: FROZEN_SNAPSHOT,
    };
    const client = {
      ...server,
      complianceReferences: [
        {
          ...FROZEN_SNAPSHOT[0]!,
          controlCode: "TAMPERED",
        },
      ],
    };
    const merged = preserveFrozenComplianceReferences(server, client);
    expect(merged.complianceReferences).toEqual(FROZEN_SNAPSHOT);
  });
});

describe("SF-2 atomic report OCC", () => {
  it("并发保存：先成功，后 stale 被拒", async () => {
    const created = await seedCase();
    const createdReport = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-c1-occ-create",
      actor: systemActor(),
    });
    expect(createdReport.ok).toBe(true);
    if (!createdReport.ok) return;

    const base = createdReport.case.reportUpdatedAt;
    const draft = createdReport.case.reportDraft!;

    await saveReportDraft(created.id, {
      ...draft,
      title: "第一次保存",
    });

    await expect(
      saveReportDraft(
        created.id,
        { ...draft, title: "过期并发保存" },
        prisma,
        { baseReportUpdatedAt: base },
      ),
    ).rejects.toBeInstanceOf(StaleReportDraftError);

    const latest = await getCaseById(created.id);
    expect(latest?.reportDraft?.title).toBe("第一次保存");
  });
});

describe("SF-4 BC / Security Evidence boundary", () => {
  it("BC 更新不得自动完成 SECURITY_VERIFICATION checklist", () => {
    const analyzed = analyzeSecurityCase(caseB);
    const generated = generateChecklist(analyzed.analysisResults);
    const securityItem = generated.find(
      (i) => i.sourceKind === "SECURITY_VERIFICATION",
    );
    expect(securityItem).toBeDefined();
    if (!securityItem) return;

    const confirmedBc: typeof caseA.businessContext = {
      ...caseB.businessContext,
      ownerVerification: "CONFIRMED",
      changeTicketStatus: "CONFIRMED",
      changeTicketId: "CHG-TEST",
      plannedTaskStatus: "CONFIRMED",
    };
    const after = applyBusinessContextCompletion(generated, confirmedBc);
    const same = after.find(
      (i) =>
        i.sourceRef?.suggestionKey === securityItem.sourceRef?.suggestionKey,
    );
    expect(same?.completed).toBe(false);
  });

  it("BC 更新 → Context 可 RESOLVED，Security Evidence 不自动 RESOLVED", async () => {
    const created = await seedCase(caseB);
    const { saveCaseState } = await import("@/services/persistence/caseRepository");
    await saveCaseState(created.id, {
      ...toNextState(created, {}),
      businessContext: {
        ...created.caseState.businessContext,
        changeTicketId: "CHG-C1-001",
        businessOwner: "张三",
      },
    });
    const withTicket = (await getCaseById(created.id))!;

    const updated = await updateBusinessContextCommand({
      caseId: withTicket.id,
      operationId: "op-bc-c1",
      baseUpdatedAt: withTicket.updatedAt,
      nextCaseState: toNextState(withTicket, {
        businessContext: {
          ...withTicket.caseState.businessContext,
          changeTicketStatus: "CONFIRMED",
          ownerVerification: "CONFIRMED",
          changeTicketId: "FORGED-SHOULD-NOT-APPLY",
          businessJustification: "forged",
        },
        checklist: withTicket.caseState.checklist.map((item) => ({
          ...item,
          completed: true,
        })),
      }),
      actor: systemActor(),
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.case.caseState.businessContext.changeTicketId).toBe(
      "CHG-C1-001",
    );
    expect(updated.case.caseState.businessContext.businessJustification).toBe(
      withTicket.caseState.businessContext.businessJustification,
    );

    const analyzed = analyzeSecurityCase({
      ...caseB,
      businessContext: updated.case.caseState.businessContext,
    });
    const securityAction = analyzed.analysisResults
      .flatMap((r) =>
        r.verificationActions.map((a) => ({
          ruleId: r.ruleId,
          actionId: a.id,
        })),
      )[0];
    expect(securityAction).toBeDefined();
    if (!securityAction) return;

    const progress = resolveInvestigationProgress({ securityCase: analyzed });
    const changeTicket = progress.contextItems.find(
      (i) => i.key === "context:changeTicketId",
    );
    expect(changeTicket?.status).toBe("RESOLVED");

    const securityEvidence = progress.evidenceItems.find(
      (i) =>
        i.key ===
        `evidence:security:${securityAction.ruleId}:${securityAction.actionId}`,
    );
    expect(securityEvidence?.status).toBe("OPEN");
  });
});

describe("SF-6 compliance runtime failure contract", () => {
  it("resolver 失败 → RESOLUTION_UNAVAILABLE，非 SUCCESS 空视图", async () => {
    const created = await seedCase(caseB);
    vi.spyOn(resolveCaseComplianceModule, "resolveCaseCompliance").mockRejectedValue(
      new Error("Knowledge DB unavailable"),
    );

    const runtime = await loadCaseComplianceWorkbenchRuntime(created);
    expect(runtime.resolutionStatus).toBe("RESOLUTION_UNAVAILABLE");
    expect(runtime.resolutionError).toBe("合规运行时暂不可用，请稍后重试。");
    expect(runtime.views.panel.groups).toEqual([]);
    expect(runtime.views.checklist.groups).toEqual([]);
    expect(runtime.views.panel.empty).toBe(true);
  });

  it("resolver 失败 → 工作台 Progress 为 RESOLUTION_UNAVAILABLE，非全 0 成功 DTO", async () => {
    const created = await seedCase(caseB);
    vi.spyOn(resolveCaseComplianceModule, "resolveCaseCompliance").mockRejectedValue(
      new Error("Knowledge DB unavailable"),
    );

    const runtime = await loadCaseWorkbenchRuntimeViews(created);
    expect(runtime.investigationProgress).toEqual({
      resolutionStatus: "RESOLUTION_UNAVAILABLE",
    });
  });
});
