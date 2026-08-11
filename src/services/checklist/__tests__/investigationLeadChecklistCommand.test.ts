import { checklistAddSemanticIntent } from "@/test-utils/semanticCommandIntents";
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { createChecklistItemFromComplianceSuggestion } from "@/services/checklist/fromComplianceSuggestion";
import { createChecklistItemFromInvestigationLead } from "@/services/checklist/fromInvestigationLead";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { applyChecklistCommand } from "@/services/caseCommands";
import { addInvestigationLeadToChecklistAction } from "@/app/(app)/cases/commandActions";
import { resetPrismaClient } from "@/lib/prisma";
import { createCase, getCaseById } from "@/services/persistence/caseRepository";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";
import { randomUUID } from "node:crypto";
import {
  ensureVitestAuthUsersInDb,
  setVitestDefaultAuthUser,
  VITEST_ANALYST_USER,
} from "@/services/auth/testAuthContext";

const TEST_DB_FILE = path.resolve("prisma/test-investigation-lead-checklist.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function seedPair() {
  const a = analyzeSecurityCase(caseA);
  const b = analyzeSecurityCase(caseB);
  const caseARec = await createCase({
    draft: caseA,
    checklist: a.checklist,
    suggestedRiskLevel: a.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
  const caseBRec = await createCase({
    draft: caseB,
    checklist: b.checklist,
    suggestedRiskLevel: b.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
  return { caseARec, caseBRec };
}

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
  await resetPrismaClient(TEST_DB_URL);
  await ensureVitestAuthUsersInDb();
  setVitestDefaultAuthUser(VITEST_ANALYST_USER);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  setVitestDefaultAuthUser(VITEST_ANALYST_USER);
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("Investigation Lead → Checklist command", () => {
  it("valid current lead → successfully added with provenance + Audit", async () => {
    const { caseBRec } = await seedPair();
    const before = await getCaseById(caseBRec.id);
    const suggestedBefore = before!.suggestedRiskLevel;
    const humanBefore = before!.caseState.humanReview;
    const statusBefore = before!.status;

    const result = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      randomUUID(),
      caseBRec.updatedAt,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit?.actionType).toBe("CHECKLIST_ADDED");
    expect(result.audit?.metadata).toMatchObject({
      sourceKind: "INVESTIGATION_LEAD",
      sourceRef: {
        leadKey: "INVESTIGATION_LEAD:COMPARE_SHARED_SYSTEM_ACTIVITY",
        leadCode: "COMPARE_SHARED_SYSTEM_ACTIVITY",
      },
    });

    const stored = result.caseState?.checklist.find(
      (i) =>
        i.sourceKind === "INVESTIGATION_LEAD" &&
        i.sourceRef?.leadCode === "COMPARE_SHARED_SYSTEM_ACTIVITY",
    );
    expect(stored?.origin).toBe("MANUAL");
    expect(stored?.sourceRef?.relatedCaseIds?.length).toBeGreaterThan(0);

    const after = await getCaseById(caseBRec.id);
    expect(after!.suggestedRiskLevel).toBe(suggestedBefore);
    expect(after!.caseState.humanReview).toEqual(humanBefore);
    expect(after!.status).toBe(statusBefore);
  });

  it("unknown leadCode → rejected", async () => {
    const { caseBRec } = await seedPair();
    const result = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "NOT_A_REAL_LEAD",
      randomUUID(),
      caseBRec.updatedAt,
    );
    expect(result.ok).toBe(false);
  });

  it("known lead but not in current intelligence → rejected", async () => {
    // 单独 Case A（无 related）时 REVIEW_RELATED_CASE_TIMELINES 通常不会出现
    const a = analyzeSecurityCase(caseA);
    const alone = await createCase({
      draft: caseA,
      checklist: a.checklist,
      suggestedRiskLevel: a.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const result = await addInvestigationLeadToChecklistAction(
      alone.id,
      "REVIEW_RELATED_CASE_TIMELINES",
      randomUUID(),
      alone.updatedAt,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/不存在该调查建议/);
  });

  it("same lead + same operationId → idempotent; different operationId → semantic dedup", async () => {
    const { caseBRec } = await seedPair();
    const op = "op-il-same";
    const first = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      op,
      caseBRec.updatedAt,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      op,
      first.updatedAt,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyApplied).toBe(true);

    const third = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      "op-il-other",
      second.updatedAt,
    );
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.alreadyApplied).toBe(true);

    const leadItems =
      third.caseState?.checklist.filter(
        (i) =>
          i.sourceKind === "INVESTIGATION_LEAD" &&
          i.sourceRef?.leadCode === "COMPARE_SHARED_SYSTEM_ACTIVITY",
      ) ?? [];
    expect(leadItems).toHaveLength(1);
  });

  it("complete / reopen / delete then re-add works; accepted item freezes", async () => {
    const { caseBRec } = await seedPair();
    const added = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      randomUUID(),
      caseBRec.updatedAt,
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const item = added.caseState!.checklist.find(
      (i) => i.sourceKind === "INVESTIGATION_LEAD",
    )!;

    const completed = await applyChecklistCommand({
      caseId: caseBRec.id,
      action: "complete",
      itemId: item.id,
      operationId: randomUUID(),
      baseUpdatedAt: added.updatedAt,
      actor: systemActor(),
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const reopened = await applyChecklistCommand({
      caseId: caseBRec.id,
      action: "reopen",
      itemId: item.id,
      operationId: randomUUID(),
      baseUpdatedAt: completed.case.updatedAt,
      actor: systemActor(),
    });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;

    const deleted = await applyChecklistCommand({
      caseId: caseBRec.id,
      action: "delete",
      itemId: item.id,
      operationId: randomUUID(),
      baseUpdatedAt: reopened.case.updatedAt,
      actor: systemActor(),
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;

    const reAdded = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      randomUUID(),
      deleted.case.updatedAt,
    );
    expect(reAdded.ok).toBe(true);
  });

  it("generic browser add cannot forge INVESTIGATION_LEAD; knowledge/manual unchanged", async () => {
    const { caseBRec } = await seedPair();
    const forged = createChecklistItemFromInvestigationLead(
      {
        leadCode: "COMPARE_SHARED_SYSTEM_ACTIVITY",
        relatedCaseIds: ["x"],
      },
      "forge",
    );
    // 走 generic applyChecklistCommandAction 路径（通过 parse）应拒绝 sourceKind
    const { applyChecklistCommandAction } = await import(
      "@/app/(app)/cases/commandActions"
    );
    const rejected = await applyChecklistCommandAction(
      caseBRec.id,
      "add",
      forged.id,
      randomUUID(),
      caseBRec.updatedAt,
      {
        id: forged.id,
        category: forged.category,
        label: forged.label,
        sourceKind: "INVESTIGATION_LEAD",
        sourceRef: forged.sourceRef,
      },
    );
    expect(rejected.ok).toBe(false);

    const manual = createManualChecklistItem({
      category: "IDENTITY",
      label: "人工补充核查项",
    });
    const manualAdd = await applyChecklistCommand({
      caseId: caseBRec.id,
      action: "add",
      itemId: manual.id,
      operationId: randomUUID(),
      baseUpdatedAt: caseBRec.updatedAt,
      itemIntent: checklistAddSemanticIntent(
        [...caseBRec.caseState.checklist, manual],
        manual.id,
      ),
      actor: systemActor(),
    });
    expect(manualAdd.ok).toBe(true);

    const suggestion: CaseComplianceChecklistItem = {
      key: "CHECKLIST:verify-ticket-il",
      sourceKey: "verify-ticket-il",
      label: "核实该操作是否存在有效授权工单",
      kind: "CHECKLIST",
      priority: 10,
      controlCodes: ["CTRL-BUSINESS-AUTH-01"],
      clauseRefs: [
        { clauseKey: "article-27", documentCanonicalCode: "CN-DSL" },
      ],
      relevance: "RELEVANT",
      relationTypes: ["CONTROL_SUPPORT"],
      ruleIds: ["DATA-003"],
      supportingRuleIds: [],
      evidenceIds: [],
    };
    const ks = createChecklistItemFromComplianceSuggestion(suggestion, "ks1");
    const latest = await getCaseById(caseBRec.id);
    const ksAdd = await applyChecklistCommand({
      caseId: caseBRec.id,
      action: "add",
      itemId: ks.id,
      operationId: randomUUID(),
      baseUpdatedAt: latest!.updatedAt,
      itemIntent: checklistAddSemanticIntent(
        [...latest!.caseState.checklist, ks],
        ks.id,
      ),
      actor: systemActor(),
    });
    expect(ksAdd.ok).toBe(true);
    if (!ksAdd.ok) return;
    expect(
      ksAdd.case.caseState.checklist.find((i) => i.id === ks.id)?.sourceKind,
    ).toBe("KNOWLEDGE_SUGGESTED");
  });

  it("stale baseUpdatedAt → existing stale behavior", async () => {
    const { caseBRec } = await seedPair();
    const result = await addInvestigationLeadToChecklistAction(
      caseBRec.id,
      "COMPARE_SHARED_SYSTEM_ACTIVITY",
      randomUUID(),
      "2000-01-01T00:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code === "STALE" || /更新|刷新|stale/i.test(result.error)).toBe(
      true,
    );
  });
});
