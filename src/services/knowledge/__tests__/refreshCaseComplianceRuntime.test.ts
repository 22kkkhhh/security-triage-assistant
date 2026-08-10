/**
 * v1.5 Workstream 1：Compliance Runtime Refresh contract 测试。
 */
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import type { ChecklistItem, SecurityCaseDraft } from "@/domain/types";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { resetPrismaClient } from "@/lib/prisma";
import {
  applyChecklistCommand,
  createCaseWithAudit,
  updateBusinessContextCommand,
} from "@/services/caseCommands";
import { createReportDraftCommand } from "@/services/caseCommands/reportCommands";
import {
  createChecklistItemFromComplianceSuggestion,
} from "@/services/checklist/fromComplianceSuggestion";
import {
  CASE_UI_COMPLIANCE_TOP_N,
} from "@/services/knowledge/caseCompliancePanel";
import { curatedPackToResolutionGraph } from "@/services/knowledge/pack/curatedPackToResolutionGraph";
import { importCuratedKnowledgePack } from "@/services/knowledge/pack/importCuratedKnowledgePack";
import {
  refreshCaseComplianceRuntimeFromGraph,
  refreshCaseComplianceRuntimeViews,
} from "@/services/knowledge/refreshCaseComplianceRuntime";
import { getCaseById } from "@/services/persistence/caseRepository";
import type { PersistedCase, SaveCaseStateInput } from "@/services/persistence/types";

const CAPTURED = "2026-08-09T12:00:00.000Z";
const graph = curatedPackToResolutionGraph();

const TEST_DB = path.resolve("prisma/test-refresh-compliance-runtime.db");
const TEST_URL = `file:${TEST_DB.replace(/\\/g, "/")}`;

function cleanDb() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${TEST_DB}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

function toPersistedCase(
  draft: SecurityCaseDraft,
  overrides: Partial<PersistedCase> = {},
): PersistedCase {
  const analyzed = analyzeSecurityCase(draft);
  return {
    id: draft.id,
    caseNumber: "TEST-001",
    title: draft.name,
    status: "INVESTIGATING",
    suggestedRiskLevel:
      analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    humanRiskLevel: draft.humanReview?.humanRiskLevel ?? null,
    humanConclusion: draft.humanReview?.finalConclusion ?? null,
    username: draft.identityContext.accountName,
    sourceIp: draft.identityContext.loginSourceIp,
    systemsSearchText: draft.identityContext.accessedSystems.join(" "),
    pendingChecklistCount: 0,
    hasReport: false,
    reportUpdatedAt: null,
    lastActivityAt: CAPTURED,
    caseState: {
      caseData: {
        name: draft.name,
        createdAt: draft.createdAt,
        alert: draft.alert,
        dataContext: draft.dataContext,
        networkContext: draft.networkContext,
        identityContext: draft.identityContext,
      },
      businessContext: draft.businessContext,
      checklist: analyzed.checklist,
      humanReview: draft.humanReview,
      timeline: draft.timeline,
    },
    reportDraft: null,
    createdAt: CAPTURED,
    updatedAt: CAPTURED,
    closedAt: null,
    ...overrides,
  };
}

function toNextState(
  record: PersistedCase,
  patch: Partial<SaveCaseStateInput> = {},
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

function knowledgeSuggestedItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items.filter(
    (item) =>
      item.sourceKind === "KNOWLEDGE_SUGGESTED" &&
      typeof item.sourceRef?.suggestionKey === "string",
  );
}

describe("refreshCaseComplianceRuntimeFromGraph（纯函数）", () => {
  it("requiredContext 缺失 → INSUFFICIENT_CONTEXT 出现在面板/清单", () => {
    const draft: SecurityCaseDraft = {
      ...caseA,
      networkContext: {
        ...caseA.networkContext,
        externalDestination: null,
        outboundTransferBytes: null,
      },
    };
    const record = toPersistedCase(draft);
    const { views } = refreshCaseComplianceRuntimeFromGraph(record, graph, {
      capturedAt: CAPTURED,
    });
    expect(views.panel.empty).toBe(false);
    expect(
      views.panel.groups.some((g) => g.relevance === "INSUFFICIENT_CONTEXT"),
    ).toBe(true);
    const checklistRelevances = views.checklist.groups.flatMap((g) =>
      g.items.map((i) => i.relevance),
    );
    expect(checklistRelevances).toContain("INSUFFICIENT_CONTEXT");
  });

  it("补齐 businessContext 后 refresh → relevance 分布变化", () => {
    const sparse: SecurityCaseDraft = {
      ...caseB,
      businessContext: {
        ...caseB.businessContext,
        changeTicketId: null,
        businessOwner: null,
        ownerVerification: "UNKNOWN",
        businessJustification: null,
        plannedTaskStatus: "NOT_FOUND",
      },
    };
    const before = refreshCaseComplianceRuntimeFromGraph(
      toPersistedCase(sparse),
      graph,
      { capturedAt: CAPTURED },
    );
    const enriched: SecurityCaseDraft = {
      ...sparse,
      businessContext: {
        ...sparse.businessContext,
        changeTicketId: "CHG-20260808-001",
        businessOwner: "张三（Mock）",
        ownerVerification: "CONFIRMED",
        businessJustification: "计划内数据导出任务",
        plannedTaskStatus: "CONFIRMED",
      },
    };
    const after = refreshCaseComplianceRuntimeFromGraph(
      toPersistedCase(enriched, { updatedAt: "2026-08-09T13:00:00.000Z" }),
      graph,
      { capturedAt: CAPTURED },
    );
    const beforeInsufficient = before.views.checklist.groups.flatMap((g) =>
      g.items.filter((i) => i.relevance === "INSUFFICIENT_CONTEXT"),
    ).length;
    const afterInsufficient = after.views.checklist.groups.flatMap((g) =>
      g.items.filter((i) => i.relevance === "INSUFFICIENT_CONTEXT"),
    ).length;
    expect(afterInsufficient).toBeLessThanOrEqual(beforeInsufficient);
    expect(JSON.stringify(before.views)).not.toBe(JSON.stringify(after.views));
  });

  it("meta 暴露 skippedUnknownRuleIds；正常 Case 为空", () => {
    const record = toPersistedCase(caseA);
    const result = refreshCaseComplianceRuntimeFromGraph(record, graph, {
      capturedAt: CAPTURED,
    });
    expect(result.resolutionStatus).toBe("SUCCESS");
    expect(Array.isArray(result.meta.skippedUnknownRuleIds)).toBe(true);
    expect(result.meta.skippedUnknownRuleIds).toEqual([]);
    expect(result.meta.hitRuleIds.length).toBeGreaterThan(0);
  });

  it("相同输入两次 refresh → 确定性输出", () => {
    const record = toPersistedCase(caseA);
    const first = refreshCaseComplianceRuntimeFromGraph(record, graph, {
      capturedAt: CAPTURED,
    });
    const second = refreshCaseComplianceRuntimeFromGraph(record, graph, {
      capturedAt: CAPTURED,
    });
    expect(first).toEqual(second);
  });

  it("Case A/B regression：面板 relevance 分布", () => {
    const a = refreshCaseComplianceRuntimeFromGraph(
      toPersistedCase(caseA),
      graph,
      { capturedAt: CAPTURED },
    );
    const b = refreshCaseComplianceRuntimeFromGraph(
      toPersistedCase(caseB),
      graph,
      { capturedAt: CAPTURED },
    );
    expect(a.views.panel.groups.map((g) => g.relevance)).toEqual(
      expect.arrayContaining(["RELEVANT", "POSSIBLE", "INSUFFICIENT_CONTEXT"]),
    );
    expect(b.views.panel.groups.some((g) => g.relevance === "POSSIBLE")).toBe(
      true,
    );
    expect(a.views.panel.totalCount).toBeLessThanOrEqual(
      CASE_UI_COMPLIANCE_TOP_N,
    );
  });
});

describe("refreshCaseComplianceRuntimeViews（DB 集成）", () => {
  beforeAll(async () => {
    cleanDb();
    process.env.DATABASE_URL = TEST_URL;
    runPrismaMigrateDeploy({ databaseUrl: TEST_URL });
    await resetPrismaClient(TEST_URL);
    await importCuratedKnowledgePack();
  });

  beforeEach(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.caseAuditLog.deleteMany();
    await prisma.caseRecord.deleteMany();
  });

  afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    cleanDb();
  });

  async function seedCase(draft: SecurityCaseDraft, operationId: string) {
    const analyzed = analyzeSecurityCase(draft);
    const created = await createCaseWithAudit(
      {
        draft,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId, actor: systemActor() },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    return created.case;
  }

  it("report snapshot 不随 context refresh 变化", async () => {
    const created = await seedCase(caseB, "refresh-report-seed");
    const report = await createReportDraftCommand({
      caseId: created.id,
      operationId: "refresh-report-create",
      actor: systemActor(),
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const beforeSnapshots =
      report.case.reportDraft?.complianceReferences ?? [];
    expect(beforeSnapshots.length).toBeGreaterThan(0);

    const nextBc = {
      ...report.case.caseState.businessContext,
      businessLegitimacy: "AUTHORIZED" as const,
      changeTicketId: "CHG-REFRESH-001",
      ownerVerification: "CONFIRMED" as const,
    };
    const updated = await updateBusinessContextCommand({
      caseId: created.id,
      operationId: "refresh-report-bc",
      baseUpdatedAt: report.case.updatedAt,
      nextCaseState: toNextState(report.case, { businessContext: nextBc }),
      actor: systemActor(),
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    const refreshed = await refreshCaseComplianceRuntimeViews(updated.case);
    expect(refreshed.views.panel.empty).toBe(false);

    const afterRecord = await getCaseById(created.id);
    expect(afterRecord?.reportDraft?.complianceReferences).toEqual(
      beforeSnapshots,
    );
  });

  it("已加入 KNOWLEDGE_SUGGESTED checklist 在 context 更新 + refresh 后保持", async () => {
    const created = await seedCase(caseB, "refresh-cl-seed");
    const suggestion = {
      key: "CHECKLIST:verify-ticket",
      sourceKey: "verify-ticket",
      label: "核实该操作是否存在有效授权工单",
      kind: "CHECKLIST" as const,
      priority: 10,
      controlCodes: ["CTRL-BUSINESS-AUTH-01"],
      clauseRefs: [
        { clauseKey: "article-21", documentCanonicalCode: "CN-DSL" },
      ],
      relevance: "INSUFFICIENT_CONTEXT" as const,
      relationTypes: ["CONTROL_SUPPORT" as const],
      ruleIds: ["DATA-001"],
      supportingRuleIds: [],
      evidenceIds: [],
    };
    const ksItem = createChecklistItemFromComplianceSuggestion(
      suggestion,
      "test001",
    );
    const withItem = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: ksItem.id,
      operationId: "refresh-cl-add",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: toNextState(created, {
        checklist: [...created.caseState.checklist, ksItem],
      }),
      actor: systemActor(),
    });
    expect(withItem.ok).toBe(true);
    if (!withItem.ok) return;

    const beforeKs = knowledgeSuggestedItems(withItem.case.caseState.checklist);

    const nextBc = {
      ...withItem.case.caseState.businessContext,
      changeTicketId: "CHG-KEEP-001",
      ownerVerification: "CONFIRMED" as const,
    };
    const updated = await updateBusinessContextCommand({
      caseId: created.id,
      operationId: "refresh-cl-bc",
      baseUpdatedAt: withItem.case.updatedAt,
      nextCaseState: toNextState(withItem.case, { businessContext: nextBc }),
      actor: systemActor(),
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    await refreshCaseComplianceRuntimeViews(updated.case);

    const afterRecord = await getCaseById(created.id);
    const afterKs = knowledgeSuggestedItems(
      afterRecord!.caseState.checklist,
    );
    expect(afterKs).toEqual(beforeKs);
  });
});
