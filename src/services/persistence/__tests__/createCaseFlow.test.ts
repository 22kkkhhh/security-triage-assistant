import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { createCaseAction } from "@/app/(app)/cases/actions";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import {
  applyFieldMapping,
  parseCsv,
  suggestFieldMapping,
} from "@/services/normalization/csv";
import { normalizeRecord } from "@/services/normalization/normalize";
import { parsePastedText } from "@/services/normalization/textParser";
import { emptyNormalizedInput } from "@/services/normalization/types";
import { resetPrismaClient } from "@/lib/prisma";
import {
  ensureVitestAuthUsersInDb,
  setVitestDefaultAuthUser,
  VITEST_ANALYST_USER,
} from "@/services/auth/testAuthContext";
import {
  getCaseById,
  listCases,
} from "@/services/persistence/caseRepository";
import { restoreWorkbenchFromPersisted } from "@/services/persistence/restoreWorkbench";

const TEST_DB_FILE = path.resolve("prisma/test-create.db");
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
  setVitestDefaultAuthUser(VITEST_ANALYST_USER);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
  await ensureVitestAuthUsersInDb();
});

afterAll(async () => {
  setVitestDefaultAuthUser(null);
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

function manualInput() {
  return normalizeRecord({
    sourceType: "MANUAL",
    pairs: [
      { rawKey: "alertName", rawValue: "手工录入敏感查询告警" },
      { rawKey: "alertTime", rawValue: "2026-08-08 02:36" },
      { rawKey: "username", rawValue: "manual_user_01" },
      { rawKey: "sourceIp", rawValue: "10.20.16.87" },
      { rawKey: "database", rawValue: "CRM_PROD" },
      { rawKey: "rowsAffected", rawValue: "182391" },
      { rawKey: "accessedSystems", rawValue: "HR系统,CRM_PROD" },
    ],
  }).input;
}

describe("新建研判持久化（Step 4）", () => {
  it("手工确认后的 draft 可创建 CaseRecord", async () => {
    const result = await createCaseAction(manualInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = await getCaseById(result.id);
    expect(record).not.toBeNull();
    expect(record!.caseNumber).toMatch(/^INC-\d{8}-\d{3}$/);
    expect(record!.title).toBe("手工录入敏感查询告警");
  });

  it("创建成功同时产生 USER CASE_CREATED Audit", async () => {
    const { listCaseAuditLogs } = await import(
      "@/services/persistence/auditRepository"
    );
    const result = await createCaseAction(manualInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const logs = await listCaseAuditLogs({ caseId: result.id });
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]!.actionType).toBe("CASE_CREATED");
    expect(logs.items[0]!.actorType).toBe("USER");
    expect(logs.items[0]!.actorId).toBe("vitest-analyst-id");
    expect(logs.items[0]!.actorName).toBe("Vitest 分析员");
  });

  it("创建失败（非法输入）不产生 Audit", async () => {
    const { prisma } = await import("@/lib/prisma");
    const before = await prisma.caseAuditLog.count();
    const result = await createCaseAction({ bogus: true });
    expect(result.ok).toBe(false);
    expect(await prisma.caseAuditLog.count()).toBe(before);
  });

  it("文本确认后的 draft 可创建 CaseRecord", async () => {
    const paste = [
      "告警名称：文本粘贴敏感访问",
      "告警时间：2026-08-08 02:36",
      "账号：paste_user_02",
      "源IP：172.16.8.23",
      "数据库：CRM_PROD",
      "访问系统：ERP系统,CRM_PROD",
    ].join("\n");
    const input = parsePastedText(paste, "DATABASE_AUDIT").input;
    const result = await createCaseAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const listed = await listCases({ search: "paste_user_02" });
    expect(listed.some((item) => item.id === result.id)).toBe(true);
  });

  it("CSV 确认后的 draft 可创建 CaseRecord", async () => {
    const csv = [
      "alert_name,alert_time,src_ip,db,rows,username,systems",
      "CSV导入告警,2026-08-08 02:36,10.30.1.9,CRM_PROD,90000,csv_user_03,HR系统|CRM_PROD",
    ].join("\n");
    const parsed = parseCsv(csv);
    const mapping = suggestFieldMapping(parsed.headers);
    const pairs = applyFieldMapping(parsed.rows[0], mapping);
    const input = normalizeRecord({
      sourceType: "DATABASE_AUDIT",
      pairs,
    }).input;
    const result = await createCaseAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byIp = await listCases({ search: "10.30.1.9" });
    expect(byIp.some((item) => item.id === result.id)).toBe(true);
    const bySystem = await listCases({ search: "HR" });
    expect(bySystem.some((item) => item.id === result.id)).toBe(true);
  });

  it("创建后 caseNumber 非空且再次读取稳定；默认 INVESTIGATING", async () => {
    const result = await createCaseAction(manualInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const first = await getCaseById(result.id);
    const second = await getCaseById(result.id);
    expect(first!.caseNumber).toBeTruthy();
    expect(second!.caseNumber).toBe(first!.caseNumber);
    expect(first!.status).toBe("INVESTIGATING");
  });

  it("初始 System Checklist 进入 caseState；HumanReview 不伪造；BusinessContext 不为 NORMAL", async () => {
    const result = await createCaseAction(manualInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = await getCaseById(result.id);
    expect(record!.caseState.checklist.length).toBeGreaterThan(0);
    expect(
      record!.caseState.checklist.every((item) => item.origin === "SYSTEM"),
    ).toBe(true);
    expect(record!.caseState.humanReview).toBeNull();
    expect(record!.caseState.businessContext.businessLegitimacy).toBe("UNKNOWN");
    expect(record!.caseState.businessContext.plannedTaskStatus).toBe("UNKNOWN");
    expect(record!.caseState.businessContext.ownerVerification).toBe("UNKNOWN");
  });

  it("创建后按 ID 恢复，且 listCases 可读取", async () => {
    const result = await createCaseAction(manualInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = restoreWorkbenchFromPersisted((await getCaseById(result.id))!);
    expect(view.caseId).toBe(result.id);
    expect(view.draft.identityContext.accountName).toBe("manual_user_01");
    const listed = await listCases({});
    expect(listed.some((item) => item.id === result.id)).toBe(true);
  });

  it("创建失败（非法载荷）不会生成半条记录", async () => {
    const before = await listCases({});
    const result = await createCaseAction({ foo: "bar" });
    expect(result.ok).toBe(false);
    const after = await listCases({});
    expect(after.length).toBe(before.length);
  });

  it("无告警名称时使用中性默认名，不出现攻击定性用语", async () => {
    const input = emptyNormalizedInput("MANUAL");
    input.username = "neutral_user";
    const result = await createCaseAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = await getCaseById(result.id);
    expect(record!.title).toBe("安全告警研判案件");
    expect(record!.title).not.toMatch(/黑客|失陷|泄露/);
  });

  it("Case A / Case B 类数据经标准化路径仍可正确创建", async () => {
    const draftA = caseA;
    const inputA = {
      ...emptyNormalizedInput("DATABASE_AUDIT"),
      alertName: draftA.alert.title,
      alertTime: "2026-08-08 01:30",
      username: draftA.identityContext.accountName,
      sourceIp: draftA.identityContext.loginSourceIp,
      database: draftA.dataContext.databaseName,
      tableName: draftA.dataContext.tableName,
      rowsAffected: draftA.dataContext.accessedRecordCount,
      accessedSystems: draftA.identityContext.accessedSystems,
      sensitiveDataTypes: draftA.dataContext.sensitiveFieldTypes,
    };
    const createdA = await createCaseAction(inputA);
    expect(createdA.ok).toBe(true);
    if (!createdA.ok) return;
    const restoredA = restoreWorkbenchFromPersisted(
      (await getCaseById(createdA.id))!,
    );
    expect(restoredA.draft.businessContext.businessLegitimacy).toBe("UNKNOWN");
    // 授权逻辑在 Workbench 补充业务上下文后生效；创建时不得伪造 AUTHORIZED
    const withAuth = analyzeSecurityCase({
      ...restoredA.draft,
      businessContext: caseA.businessContext,
    });
    expect(withAuth.suggestedAssessment?.businessLegitimacy).toBe("AUTHORIZED");

    const inputB = {
      ...emptyNormalizedInput("AUTH"),
      alertName: caseB.alert.title,
      alertTime: "2026-08-08 02:36",
      username: caseB.identityContext.accountName,
      sourceIp: caseB.identityContext.loginSourceIp,
      failedLoginAttempts: caseB.identityContext.failedLoginAttempts,
      accessedSystems: caseB.identityContext.accessedSystems,
      database: caseB.dataContext.databaseName,
      rowsAffected: caseB.dataContext.accessedRecordCount,
      externalCommunication: caseB.networkContext.externalCommunication,
      destinationIp: "203.0.113.42",
      outboundTransferBytes: caseB.networkContext.outboundTransferBytes,
      sensitiveDataTypes: caseB.dataContext.sensitiveFieldTypes,
    };
    const createdB = await createCaseAction(inputB);
    expect(createdB.ok).toBe(true);
    if (!createdB.ok) return;
    const restoredB = restoreWorkbenchFromPersisted(
      (await getCaseById(createdB.id))!,
    );
    const analyzedB = analyzeSecurityCase(restoredB.draft);
    expect(analyzedB.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
  });

  it("buildSecurityCaseDraft 在确认后仍保持 UNKNOWN 业务上下文", () => {
    const draft = buildSecurityCaseDraft(manualInput(), "tmp");
    expect(draft.humanReview).toBeNull();
    expect(draft.businessContext.businessLegitimacy).toBe("UNKNOWN");
  });
});
