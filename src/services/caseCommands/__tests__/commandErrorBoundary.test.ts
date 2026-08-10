import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { systemActor } from "@/services/audit/auditEventBuilder";
import {
  COMMAND_ERROR_MESSAGES,
  COMPLIANCE_RUNTIME_UNAVAILABLE_MESSAGE,
  isKnownBusinessCommandError,
  resolveCommandErrorMessage,
} from "@/services/caseCommands/commandErrorBoundary";
import {
  StaleCaseStateError,
  StaleReportDraftError,
} from "@/services/persistence/caseRepository";
import { refreshCaseComplianceRuntimeFromGraph } from "@/services/knowledge/refreshCaseComplianceRuntime";
import { caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { createCase } from "@/services/persistence/caseRepository";
import { resetPrismaClient } from "@/lib/prisma";

const TEST_DB_FILE = path.resolve("prisma/test-command-error-boundary.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

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

describe("commandErrorBoundary unit", () => {
  it("未知 infrastructure 异常 → 稳定文案，不含原始 message", () => {
    const internal = new Error("敏感内部数据库错误 prisma P2002 unique constraint");
    expect(
      resolveCommandErrorMessage(internal, COMMAND_ERROR_MESSAGES.caseUpdate),
    ).toBe(COMMAND_ERROR_MESSAGES.caseUpdate);
    expect(
      resolveCommandErrorMessage(internal, COMMAND_ERROR_MESSAGES.caseUpdate),
    ).not.toContain("敏感");
  });

  it("StaleCaseStateError / StaleReportDraftError 保留业务语义", () => {
    const staleCase = new StaleCaseStateError("案件已发生更新，已刷新到最新状态。");
    const staleReport = new StaleReportDraftError("报告已在其他页面发生更新");

    expect(resolveCommandErrorMessage(staleCase, COMMAND_ERROR_MESSAGES.caseUpdate)).toBe(
      staleCase.message,
    );
    expect(resolveCommandErrorMessage(staleReport, COMMAND_ERROR_MESSAGES.reportSave)).toBe(
      staleReport.message,
    );
    expect(isKnownBusinessCommandError(staleCase)).toBe(true);
    expect(isKnownBusinessCommandError(staleReport)).toBe(true);
  });

  it("Actor / 交接说明校验错误保留原文", () => {
    const actorError = new Error("USER Actor 缺少 actorId");
    const handoffError = new Error("交接说明不能为空");

    expect(resolveCommandErrorMessage(actorError, COMMAND_ERROR_MESSAGES.actorInvalid)).toBe(
      actorError.message,
    );
    expect(
      resolveCommandErrorMessage(handoffError, COMMAND_ERROR_MESSAGES.handoffValidation),
    ).toBe(handoffError.message);
  });

  it("compliance runtime resolutionError 使用稳定文案", () => {
    expect(COMPLIANCE_RUNTIME_UNAVAILABLE_MESSAGE).not.toMatch(/Knowledge DB/);
    expect(COMPLIANCE_RUNTIME_UNAVAILABLE_MESSAGE).toContain("合规运行时");
  });
});

describe("commandErrorBoundary integration (mocked persistence)", () => {
  it("case persistence failure → CommandResult.error 不含内部 message", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    vi.resetModules();
    const auditRepo = await import("@/services/persistence/auditRepository");
    vi.spyOn(auditRepo, "runInTransaction").mockRejectedValueOnce(
      new Error("敏感内部数据库错误 connection pool timeout"),
    );
    const { changeCaseStatusCommand } = await import(
      "@/services/caseCommands/caseCommands"
    );

    const result = await changeCaseStatusCommand({
      caseId: created.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "op-status-error-1",
      baseUpdatedAt: created.updatedAt,
      actor: systemActor(),

    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(COMMAND_ERROR_MESSAGES.caseUpdate);
    expect(result.error).not.toContain("敏感");

    vi.restoreAllMocks();
  });

  it("report save persistence failure → 稳定文案", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    vi.resetModules();
    const { createReportDraftCommand } = await import(
      "@/services/caseCommands/reportCommands"
    );
    const createdReport = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-report-for-save-error",
      actor: systemActor(),
    });
    expect(createdReport.ok).toBe(true);
    if (!createdReport.ok) return;

    const caseRepo = await import("@/services/persistence/caseRepository");
    vi.spyOn(caseRepo, "saveReportDraft").mockRejectedValueOnce(
      new Error("敏感内部数据库错误 disk I/O error"),
    );
    const { saveReportDraftCommand } = await import(
      "@/services/caseCommands/reportCommands"
    );

    const result = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: createdReport.case.reportDraft!,
      baseReportUpdatedAt: createdReport.case.reportUpdatedAt,
      actor: systemActor(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(COMMAND_ERROR_MESSAGES.reportSave);
    expect(result.error).not.toContain("敏感");

    vi.restoreAllMocks();
  });

  it("handoff persistence failure → 稳定文案", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    vi.resetModules();
    const auditRepo = await import("@/services/persistence/auditRepository");
    vi.spyOn(auditRepo, "runInTransaction").mockRejectedValueOnce(
      new Error("敏感内部数据库错误 audit write failed"),
    );

    const { addHandoffNoteCommand } = await import(
      "@/services/caseCommands/handoffCommands"
    );
    const result = await addHandoffNoteCommand({
      caseId: created.id,
      note: "测试交接说明",
      operationId: "op-handoff-error-1",
      actor: systemActor(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(COMMAND_ERROR_MESSAGES.handoffAdd);
    expect(result.error).not.toContain("敏感");

    vi.restoreAllMocks();
  });

  it("resolver failure → resolutionError 稳定，不含 exception.message", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const graph = {
      resolveControl: () => {
        throw new Error("Knowledge DB unavailable secret connection string");
      },
    } as unknown as Parameters<typeof refreshCaseComplianceRuntimeFromGraph>[1];

    const result = refreshCaseComplianceRuntimeFromGraph(created, graph);
    expect(result.resolutionStatus).toBe("RESOLUTION_UNAVAILABLE");
    expect(result.resolutionError).toBe(COMPLIANCE_RUNTIME_UNAVAILABLE_MESSAGE);
    expect(result.resolutionError).not.toContain("Knowledge DB");
    expect(result.resolutionError).not.toContain("secret");
  });
});
