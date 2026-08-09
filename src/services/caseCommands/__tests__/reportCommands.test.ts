import { execSync } from "node:child_process";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  createReportDraftCommand,
  exportReportCommand,
  saveReportDraftCommand,
} from "@/services/caseCommands/reportCommands";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import { prisma } from "@/lib/prisma";
import {
  createCase,
  getCaseById,
  saveReportDraft,
  StaleReportDraftError,
} from "@/services/persistence/caseRepository";
import { loadReportPage } from "@/services/persistence/reportDraftService";

const TEST_DB_FILE = path.resolve("prisma/test-report-commands.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

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
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
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

describe("reportCommands（v1.2 Step 3）", () => {
  it("显式生成报告产生 REPORT_CREATED；GET 不创建", async () => {
    const created = await seedCase();
    const before = await loadReportPage(created.id);
    expect(before.status).toBe("no_report");

    const result = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-report-create-1", actor: systemActor()
});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit?.actionType).toBe("REPORT_CREATED");
    expect(result.audit?.actorType).toBe("SYSTEM");
    expect(result.audit?.summary).toBe("生成调查报告初稿");
    expect(JSON.stringify(result.audit)).not.toContain("sections");

    const loaded = await loadReportPage(created.id);
    expect(loaded.status).toBe("ready");
  });

  it("已有 reportDraft 不重复创建 / operationId 幂等", async () => {
    const created = await seedCase();
    const first = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-report-create-2", actor: systemActor()
});
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-report-create-2", actor: systemActor()
});
    expect(retry.ok && retry.alreadyApplied).toBe(true);
    if (!retry.ok) return;
    expect(retry.case.id).toBe(first.case.id);

    const secondClick = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-report-create-other", actor: systemActor()
});
    expect(secondClick.ok && secondClick.alreadyApplied).toBe(true);

    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "REPORT_CREATED"),
    ).toHaveLength(1);
  });

  it("REPORT_UPDATED：会话首次保存一条；后续 autosave 不刷；不改 HumanReview/caseState", async () => {
    const created = await seedCase();
    const createdReport = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-ru-create", actor: systemActor()
});
    expect(createdReport.ok).toBe(true);
    if (!createdReport.ok) return;

    const hrBefore = createdReport.case.caseState.humanReview;
    const draft = createdReport.case.reportDraft!;
    const edited = {
      ...draft,
      title: `${draft.title}-已编辑`,
    };

    const firstSave = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: edited,
      baseReportUpdatedAt: createdReport.case.reportUpdatedAt,
      auditOperationId: "op-ru-session-1", actor: systemActor()
});
    expect(firstSave.ok).toBe(true);
    if (!firstSave.ok) return;
    expect(firstSave.audit?.actionType).toBe("REPORT_UPDATED");
    expect(JSON.stringify(firstSave.audit?.changes)).not.toContain("已编辑");

    const activityAfterFirst = firstSave.case.lastActivityAt;

    await new Promise((r) => setTimeout(r, 20));
    const secondSave = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: { ...edited, title: `${edited.title}-再改` },
      baseReportUpdatedAt: firstSave.case.reportUpdatedAt,
      auditOperationId: null, actor: systemActor()
});
    expect(secondSave.ok).toBe(true);
    if (!secondSave.ok) return;
    expect(secondSave.audit).toBeNull();
    expect(secondSave.case.lastActivityAt).toBe(activityAfterFirst);
    expect(secondSave.case.reportUpdatedAt).not.toBe(
      firstSave.case.reportUpdatedAt,
    );

    const after = await getCaseById(created.id);
    expect(after?.caseState.humanReview).toEqual(hrBefore);

    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "REPORT_UPDATED"),
    ).toHaveLength(1);

    // 新编辑会话
    const session2 = await saveReportDraftCommand({
      caseId: created.id,
      reportDraft: { ...edited, title: "会话二" },
      baseReportUpdatedAt: secondSave.case.reportUpdatedAt,
      auditOperationId: "op-ru-session-2", actor: systemActor()
});
    expect(session2.ok).toBe(true);
    if (!session2.ok) return;
    expect(session2.audit?.actionType).toBe("REPORT_UPDATED");
    const logs2 = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs2.items.filter((x) => x.actionType === "REPORT_UPDATED"),
    ).toHaveLength(2);
  });

  it("stale reportDraft 不覆盖；reportUpdatedAt 并发", async () => {
    const created = await seedCase();
    const r = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-stale-create", actor: systemActor()
});
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const base = r.case.reportUpdatedAt;
    await saveReportDraft(created.id, {
      ...r.case.reportDraft!,
      title: "服务端较新版本",
    });

    await expect(
      saveReportDraft(
        created.id,
        { ...r.case.reportDraft!, title: "过期客户端" },
        prisma,
        { baseReportUpdatedAt: base },
      ),
    ).rejects.toBeInstanceOf(StaleReportDraftError);

    const latest = await getCaseById(created.id);
    expect(latest?.reportDraft?.title).toBe("服务端较新版本");
  });

  it("导出成功写 REPORT_EXPORTED；不改 reportUpdatedAt；更新 lastActivityAt；retry 幂等", async () => {
    const created = await seedCase();
    const r = await createReportDraftCommand({
      caseId: created.id,
      operationId: "op-ex-create", actor: systemActor()
});
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const reportUpdatedAtBefore = r.case.reportUpdatedAt;
    await new Promise((x) => setTimeout(x, 15));

    const exported = await exportReportCommand({
      caseId: created.id,
      operationId: "op-export-1", actor: systemActor()
});
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.fileBase64.length).toBeGreaterThan(100);
    expect(exported.reportUpdatedAt).toBe(reportUpdatedAtBefore);
    expect(
      new Date(exported.lastActivityAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(r.case.lastActivityAt).getTime());

    const retry = await exportReportCommand({
      caseId: created.id,
      operationId: "op-export-1", actor: systemActor()
});
    expect(retry.ok && retry.alreadyApplied).toBe(true);
    if (!retry.ok) return;
    // Audit 幂等 ≠ 文件响应缓存：retry 仍返回可用 DOCX，但不新增 Audit
    expect(retry.fileBase64.length).toBeGreaterThan(100);
    expect(
      (await listCaseAuditLogs({ caseId: created.id })).items.filter(
        (x) => x.actionType === "REPORT_EXPORTED",
      ),
    ).toHaveLength(1);

    const again = await exportReportCommand({
      caseId: created.id,
      operationId: "op-export-2", actor: systemActor()
});
    expect(again.ok && !again.alreadyApplied).toBe(true);

    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "REPORT_EXPORTED"),
    ).toHaveLength(2);
  });

  it("Case A / Case B 报告结论文本回归", async () => {
    const a = await seedCase(caseA);
    const b = await seedCase(caseB);
    const ra = await createReportDraftCommand({
      caseId: a.id,
      operationId: "op-reg-a", actor: systemActor()
});
    const rb = await createReportDraftCommand({
      caseId: b.id,
      operationId: "op-reg-b", actor: systemActor()
});
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    const textA = ra.case.reportDraft!.sections.map((s) => s.content).join("\n");
    const textB = rb.case.reportDraft!.sections.map((s) => s.content).join("\n");
    expect(textA).toContain("正常授权业务行为");
    expect(textB).toContain("疑似安全事件");
  });
});
