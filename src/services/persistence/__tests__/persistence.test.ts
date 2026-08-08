import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { resetPrismaClient } from "@/lib/prisma";
import { buildReportData } from "@/services/reporting/reportBuilder";
import {
  mergeChecklistOnRestore,
  toSecurityCaseDraft,
} from "@/services/persistence/caseMapper";
import {
  createCase,
  getCaseByCaseNumber,
  getCaseById,
  listCases,
  saveCaseState,
  saveReportDraft,
} from "@/services/persistence/caseRepository";

const TEST_DB_FILE = path.resolve("prisma/test.db");
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

describe("案件持久化（Step 1）", () => {
  it("新建 SecurityCase 可以保存，并按 ID 恢复", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    expect(created.id).toBeTruthy();
    expect(created.caseNumber).toMatch(/^INC-\d{8}-\d{3}$/);

    const restored = await getCaseById(created.id);
    expect(restored).not.toBeNull();
    expect(restored!.caseNumber).toBe(created.caseNumber);
    expect(restored!.caseState.caseData.alert.title).toBe(caseA.alert.title);
  });

  it("案件编号创建后保持稳定", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const before = created.caseNumber;

    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });

    const again = await getCaseById(created.id);
    expect(again!.caseNumber).toBe(before);
    const byNumber = await getCaseByCaseNumber(before);
    expect(byNumber!.id).toBe(created.id);
  });

  it("Checklist 完成状态与人工新增可以恢复", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const manual = createManualChecklistItem({
      category: "IDENTITY",
      label: "核查账号权限范围",
      note: "人工新增",
    });
    const nextChecklist = [
      ...created.caseState.checklist.map((item) =>
        item.label === "确认数据是否被导出及去向"
          ? { ...item, completed: true, note: "已核实" }
          : item,
      ),
      manual,
    ];

    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: nextChecklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });

    const restored = await getCaseById(created.id);
    const completed = restored!.caseState.checklist.find(
      (item) => item.label === "确认数据是否被导出及去向",
    );
    expect(completed?.completed).toBe(true);
    expect(completed?.note).toBe("已核实");
    expect(
      restored!.caseState.checklist.some(
        (item) => item.origin === "MANUAL" && item.label === "核查账号权限范围",
      ),
    ).toBe(true);
  });

  it("Business Context / HumanReview / Timeline 可以恢复", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const timeline = [
      ...created.caseState.timeline,
      {
        id: "persist-tl-1",
        occurredAt: "2026-08-08T10:00:00+08:00",
        eventType: "其他",
        title: "保全日志",
        description: "已申请保全认证与数据库审计日志。",
        operator: "王研判",
        source: "HUMAN" as const,
      },
    ];
    const businessContext = {
      ...created.caseState.businessContext,
      ownerVerification: "NOT_CONFIRMED" as const,
      businessLegitimacy: "UNKNOWN" as const,
    };
    const humanReview = {
      reviewer: "王研判",
      finalConclusion: "SUSPECTED_SECURITY_INCIDENT" as const,
      humanRiskLevel: "HIGH" as const,
      conclusionNote: "疑似安全事件，建议进一步核查。",
      adjustments: [],
      confirmedAt: "2026-08-08T10:05:00+08:00",
    };

    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext,
      checklist: created.caseState.checklist,
      humanReview,
      timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });

    const restored = await getCaseById(created.id);
    expect(restored!.caseState.businessContext.ownerVerification).toBe(
      "NOT_CONFIRMED",
    );
    expect(restored!.caseState.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
    expect(restored!.humanConclusion).toBe("SUSPECTED_SECURITY_INCIDENT");
    expect(
      restored!.caseState.timeline.some((event) => event.id === "persist-tl-1"),
    ).toBe(true);
  });

  it("人工修改 ReportData 不会被重新生成覆盖", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const draftReport = buildReportData({
      securityCase: analyzed,
      humanReview: analyzed.humanReview,
      checklist: analyzed.checklist,
      timeline: analyzed.timeline,
    });
    draftReport.title = "人工修改后的报告标题";
    await saveReportDraft(created.id, draftReport);

    const restored = await getCaseById(created.id);
    expect(restored!.hasReport).toBe(true);
    expect(restored!.reportDraft?.title).toBe("人工修改后的报告标题");

    // 模拟“重新打开后错误地重新 build”——恢复逻辑应优先使用已保存草稿
    const regenerated = buildReportData({
      securityCase: analyzed,
      humanReview: analyzed.humanReview,
      checklist: analyzed.checklist,
      timeline: analyzed.timeline,
    });
    expect(restored!.reportDraft!.title).not.toBe(regenerated.title);
    expect(restored!.reportDraft!.title).toBe("人工修改后的报告标题");
  });

  it("UNKNOWN 状态持久化后仍然是 UNKNOWN", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const restored = await getCaseById(created.id);
    expect(restored!.caseState.caseData.networkContext.externalCommunication).toBe(
      "UNKNOWN",
    );
    expect(restored!.caseState.caseData.networkContext.networkStatus).toBe(
      "UNKNOWN",
    );
  });

  it("Case A / Case B 恢复后人工结论保持不变", async () => {
    const a = analyzeSecurityCase(caseA);
    const b = analyzeSecurityCase(caseB);
    const savedA = await createCase({
      draft: caseA,
      checklist: a.checklist,
      suggestedRiskLevel: a.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const savedB = await createCase({
      draft: caseB,
      checklist: b.checklist,
      suggestedRiskLevel: b.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    expect((await getCaseById(savedA.id))!.caseState.humanReview?.finalConclusion).toBe(
      "NORMAL_BUSINESS",
    );
    expect((await getCaseById(savedB.id))!.caseState.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
  });

  it("listCases 返回正确索引字段", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const [item] = await listCases({ search: created.caseNumber });
    expect(item).toMatchObject({
      id: created.id,
      caseNumber: created.caseNumber,
      title: caseB.name,
      username: caseB.identityContext.accountName,
      sourceIp: caseB.identityContext.loginSourceIp,
      pendingChecklistCount: created.pendingChecklistCount,
      hasReport: false,
    });
    expect(item.systemsSearchText).toContain("CRM_PROD");
    expect(item.suggestedRiskLevel).toBe("HIGH");
  });

  it("可按事件名称搜索", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const found = await listCases({ search: "授权迁移" });
    expect(found.some((item) => item.title.includes("授权迁移"))).toBe(true);
  });

  it("历史案件可按案件编号 / 账号 / 源 IP / 系统搜索", async () => {
    const a = analyzeSecurityCase(caseA);
    const b = analyzeSecurityCase(caseB);
    const savedA = await createCase({
      draft: caseA,
      checklist: a.checklist,
      suggestedRiskLevel: a.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    await createCase({
      draft: caseB,
      checklist: b.checklist,
      suggestedRiskLevel: b.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const byNumber = await listCases({ search: savedA.caseNumber });
    expect(byNumber.map((item) => item.id)).toContain(savedA.id);

    const byUser = await listCases({ search: "demo_user_07" });
    expect(byUser.some((item) => item.username?.includes("demo_user_07"))).toBe(
      true,
    );

    const byIp = await listCases({ search: "172.16.8.23" });
    expect(byIp.some((item) => item.sourceIp === "172.16.8.23")).toBe(true);

    const bySystem = await listCases({ search: "CRM" });
    expect(bySystem.some((item) => item.systemsSearchText?.includes("CRM"))).toBe(
      true,
    );
  });

  it("状态筛选正确；已闭环案件可正常读取", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      status: "INVESTIGATING",
    });

    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: "CLOSED",
    });

    const closed = await listCases({ status: "CLOSED" });
    expect(closed.some((item) => item.id === created.id)).toBe(true);
    const restored = await getCaseById(created.id);
    expect(restored!.status).toBe("CLOSED");
    expect(restored!.closedAt).not.toBeNull();
  });

  it("恢复后重新分析时 Checklist 合并保留用户状态", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const persisted = analyzed.checklist.map((item) =>
      item.label === "查询变更工单"
        ? { ...item, completed: true, note: "已确认工单" }
        : item,
    );
    const manual = createManualChecklistItem({
      category: "BUSINESS",
      label: "补充业务说明附件",
    });
    const withManual = [...persisted, manual];

    // 模拟再次运行规则生成的清单（ID 可能不同）
    const fresh = analyzeSecurityCase(caseA).checklist;
    const merged = mergeChecklistOnRestore(withManual, fresh);

    expect(
      merged.find((item) => item.label === "查询变更工单")?.completed,
    ).toBe(true);
    expect(
      merged.find((item) => item.label === "查询变更工单")?.note,
    ).toBe("已确认工单");
    expect(
      merged.some((item) => item.origin === "MANUAL" && item.label === "补充业务说明附件"),
    ).toBe(true);
  });

  it("toSecurityCaseDraft 可还原并重新运行规则引擎", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const restored = await getCaseById(created.id);
    const draft = toSecurityCaseDraft(restored!.id, restored!.caseState);
    const reanalyzed = analyzeSecurityCase(draft);
    expect(reanalyzed.analysisResults.length).toBe(11);
    expect(reanalyzed.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
  });

  it("SQLite 测试库文件路径不指向仓库应提交的位置以外的运行时库", () => {
    // 运行时库已在 .gitignore；本测试使用独立 test.db
    expect(TEST_DB_FILE.includes("prisma")).toBe(true);
    expect(TEST_DB_FILE.endsWith("test.db")).toBe(true);
  });

  it("Checklist 变化后 pendingChecklistCount 同步更新", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const before = created.pendingChecklistCount;
    expect(before).toBe(
      analyzed.checklist.filter((item) => !item.completed).length,
    );

    const nextChecklist = created.caseState.checklist.map((item) =>
      item.completed ? item : { ...item, completed: true },
    );
    const saved = await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: nextChecklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });
    expect(saved.pendingChecklistCount).toBe(0);
    expect((await getCaseById(created.id))!.pendingChecklistCount).toBe(0);
  });

  it("HumanReview 修改后 humanRiskLevel / humanConclusion 同步更新", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: {
        ...caseB,
        humanReview: null,
      },
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    expect(created.humanRiskLevel).toBeNull();
    expect(created.humanConclusion).toBeNull();

    const saved = await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: {
        reviewer: "王研判",
        finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
        humanRiskLevel: "HIGH",
        conclusionNote: "疑似安全事件",
        adjustments: [],
        confirmedAt: "2026-08-08T10:00:00+08:00",
      },
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });
    expect(saved.humanRiskLevel).toBe("HIGH");
    expect(saved.humanConclusion).toBe("SUSPECTED_SECURITY_INCIDENT");
    const list = await listCases({ riskLevel: "HIGH" });
    expect(list.some((item) => item.id === created.id)).toBe(true);
  });

  it("涉及系统变化后 systemsSearchText 同步更新", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    expect(created.systemsSearchText).toContain("CRM_PROD");

    const saved = await saveCaseState(created.id, {
      caseData: {
        ...created.caseState.caseData,
        identityContext: {
          ...created.caseState.caseData.identityContext,
          accessedSystems: ["OA 系统", "财务系统"],
        },
      },
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });
    expect(saved.systemsSearchText).toBe("OA 系统|财务系统");
    const byOa = await listCases({ search: "OA" });
    expect(byOa.some((item) => item.id === created.id)).toBe(true);
    const byCrm = await listCases({ search: "CRM_PROD" });
    expect(byCrm.some((item) => item.id === created.id)).toBe(false);
  });
});
