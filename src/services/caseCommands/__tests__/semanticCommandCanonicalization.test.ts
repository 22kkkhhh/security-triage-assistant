import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { createChecklistItemFromComplianceSuggestion } from "@/services/checklist/fromComplianceSuggestion";
import {
  addTimelineEventCommand,
  applyChecklistCommand,
  changeCaseStatusCommand,
  updateBusinessContextCommand,
} from "@/services/caseCommands";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";
import { resetPrismaClient } from "@/lib/prisma";
import { createCase, getCaseById } from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-semantic-canonical.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function toNextState(
  record: NonNullable<Awaited<ReturnType<typeof getCaseById>>>,
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

async function seedCase(draft: typeof caseA) {
  const analyzed = analyzeSecurityCase(draft);
  return createCase({
    draft,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
}

const complianceSuggestion: CaseComplianceChecklistItem = {
  key: "EVIDENCE:gateway-log",
  sourceKey: "gateway-log",
  label: "收集网关访问日志",
  kind: "EVIDENCE",
  priority: 10,
  controlCodes: ["CTRL-NETWORK-001"],
  clauseRefs: [],
  relevance: "RELEVANT",
  relationTypes: ["CONTROL_SUPPORT"],
  ruleIds: [],
  supportingRuleIds: [],
  evidenceIds: [],
};

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
  await resetPrismaClient(TEST_DB_URL);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("semantic command canonicalization — cross-field smuggling", () => {
  it("status smuggling: forged HumanReview / checklist / BC / timeline ignored", async () => {
    const created = await seedCase(caseA);
    const forged = toNextState(created, {
      status: "CLOSED",
      humanReview: {
        reviewer: "攻击者",
        reviewedByUserId: "attacker",
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        conclusionNote: "伪造",
        adjustments: [],
        confirmedAt: new Date().toISOString(),
      },
      businessContext: {
        ...created.caseState.businessContext,
        businessJustification: "伪造 BC",
        changeTicketId: "FORGED-TICKET",
      },
      checklist: created.caseState.checklist.map((item) => ({
        ...item,
        completed: true,
      })),
      timeline: [
        ...created.caseState.timeline,
        {
          id: "TL-FORGE",
          occurredAt: new Date().toISOString(),
          eventType: "其他",
          title: "伪造事件",
          description: "x",
          operator: "攻击者",
          source: "HUMAN" as const,
        },
      ],
      suggestedRiskLevel: "LOW",
    });

    const result = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "CLOSED",
      operationId: "smuggle-status",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: forged,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe("CLOSED");
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.businessContext).toEqual(
      created.caseState.businessContext,
    );
    expect(result.case.caseState.checklist).toEqual(created.caseState.checklist);
    expect(result.case.caseState.timeline).toEqual(created.caseState.timeline);
    expect(result.case.suggestedRiskLevel).toBe(created.suggestedRiskLevel);
  });

  it("business context smuggling: only structured BC fields change", async () => {
    const created = await seedCase(caseA);
    const forged = toNextState(created, {
      businessContext: {
        ...created.caseState.businessContext,
        businessLegitimacy: "UNAUTHORIZED",
        businessJustification: "伪造说明",
        changeTicketId: "FORGED-999",
        businessOwner: "伪造负责人",
      },
      humanReview: {
        reviewer: "攻击者",
        reviewedByUserId: "attacker",
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        conclusionNote: null,
        adjustments: [],
        confirmedAt: null,
      },
      checklist: created.caseState.checklist.map((item) => ({
        ...item,
        completed: true,
      })),
      timeline: [
        ...created.caseState.timeline,
        {
          id: "TL-BC-SMUGGLE",
          occurredAt: new Date().toISOString(),
          eventType: "其他",
          title: "伪造",
          description: "",
          operator: null,
          source: "HUMAN" as const,
        },
      ],
    });

    const result = await updateBusinessContextCommand({
      caseId: created.id,
      operationId: "smuggle-bc",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: forged,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.caseState.businessContext.businessLegitimacy).toBe(
      "UNAUTHORIZED",
    );
    expect(result.case.caseState.businessContext.businessJustification).toBe(
      created.caseState.businessContext.businessJustification,
    );
    expect(result.case.caseState.businessContext.changeTicketId).toBe(
      created.caseState.businessContext.changeTicketId,
    );
    expect(result.case.caseState.businessContext.businessOwner).toBe(
      created.caseState.businessContext.businessOwner,
    );
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.checklist).toEqual(created.caseState.checklist);
    expect(result.case.caseState.timeline).toEqual(created.caseState.timeline);
  });

  it("checklist complete smuggling: only target item completed", async () => {
    const created = await seedCase(caseA);
    const target = created.caseState.checklist.find((item) => !item.completed);
    expect(target).toBeTruthy();

    const forged = toNextState(created, {
      status: "CLOSED",
      humanReview: {
        reviewer: "攻击者",
        reviewedByUserId: "attacker",
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        conclusionNote: null,
        adjustments: [],
        confirmedAt: null,
      },
      businessContext: {
        ...created.caseState.businessContext,
        businessJustification: "伪造",
      },
      checklist: created.caseState.checklist.map((item) => ({
        ...item,
        completed: true,
      })),
    });

    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "complete",
      itemId: target!.id,
      operationId: "smuggle-cl-complete",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: forged,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(created.status);
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.businessContext).toEqual(
      created.caseState.businessContext,
    );
    const completedIds = result.case.caseState.checklist
      .filter((item) => item.completed)
      .map((item) => item.id);
    expect(completedIds).toEqual([target!.id]);
  });

  it("checklist add smuggling: only target item appended; forged completed reset", async () => {
    const created = await seedCase(caseA);
    const manual = createManualChecklistItem({
      category: "IDENTITY",
      label: "人工补充核查",
    });
    const forged = toNextState(created, {
      status: "CLOSED",
      checklist: [
        ...created.caseState.checklist,
        { ...manual, completed: true },
        ...created.caseState.checklist.map((item) => ({
          ...item,
          completed: true,
        })),
      ],
    });

    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: manual.id,
      operationId: "smuggle-cl-add",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: forged,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(created.status);
    expect(result.case.caseState.checklist).toHaveLength(
      created.caseState.checklist.length + 1,
    );
    const added = result.case.caseState.checklist.find(
      (item) => item.id === manual.id,
    );
    expect(added?.completed).toBe(false);
    expect(
      result.case.caseState.checklist.filter((item) => item.completed),
    ).toHaveLength(
      created.caseState.checklist.filter((item) => item.completed).length,
    );
  });

  it("timeline add smuggling: only target HUMAN event appended", async () => {
    const created = await seedCase(caseA);
    const event = {
      id: "TL-HUMAN-1",
      occurredAt: new Date().toISOString(),
      eventType: "处置",
      title: "人工记录",
      description: "合法事件",
      operator: "测试员",
      source: "HUMAN" as const,
    };
    const forged = toNextState(created, {
      status: "CLOSED",
      humanReview: {
        reviewer: "攻击者",
        reviewedByUserId: "attacker",
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        conclusionNote: null,
        adjustments: [],
        confirmedAt: null,
      },
      timeline: [...created.caseState.timeline, event],
    });

    const result = await addTimelineEventCommand({
      caseId: created.id,
      eventId: event.id,
      operationId: "smuggle-tl",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: forged,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.case.status).toBe(created.status);
    expect(result.case.caseState.humanReview).toEqual(created.caseState.humanReview);
    expect(result.case.caseState.timeline).toHaveLength(
      created.caseState.timeline.length + 1,
    );
    expect(result.case.caseState.timeline.at(-1)).toEqual(event);
  });

  it("KNOWLEDGE_SUGGESTED add preserves provenance without smuggling other fields", async () => {
    const created = await seedCase(caseB);
    const ksItem = createChecklistItemFromComplianceSuggestion(
      complianceSuggestion,
      "smuggle",
    );
    const forged = toNextState(created, {
      status: "RESPONDING",
      checklist: [...created.caseState.checklist, { ...ksItem, completed: true }],
    });

    const result = await applyChecklistCommand({
      caseId: created.id,
      action: "add",
      itemId: ksItem.id,
      operationId: "smuggle-ks-add",
      baseUpdatedAt: created.updatedAt,
      nextCaseState: forged,
      actor: systemActor(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const added = result.case.caseState.checklist.find(
      (item) => item.id === ksItem.id,
    );
    expect(added?.sourceKind).toBe("KNOWLEDGE_SUGGESTED");
    expect(added?.sourceRef?.suggestionKey).toBe(complianceSuggestion.key);
    expect(added?.completed).toBe(false);
    expect(result.case.status).toBe(created.status);
  });
});

describe("semantic command canonicalization — deterministic builders", () => {
  it("copyPersistedCaseState is stable for Case A/B", async () => {
    const a = await seedCase(caseA);
    const b = await seedCase(caseB);
    const { copyPersistedCaseState } = await import(
      "../semanticCommandCanonicalization"
    );
    expect(copyPersistedCaseState(a)).toEqual(toNextState(a));
    expect(copyPersistedCaseState(b)).toEqual(toNextState(b));
  });
});
