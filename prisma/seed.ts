/**
 * Demo 种子：Case A / Case B（虚构 Mock 数据）+ 开发环境 Demo Users。
 * 固定 id / caseNumber / Audit operationId，可重复执行（幂等）。
 * Demo Users 仅非 production；通过 Better Auth createUser 创建。
 * 运行：npm run db:seed
 */
import "dotenv/config";
import { caseA, caseB } from "../src/domain/demo";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import { prisma } from "../src/lib/prisma";
import {
  isDemoProvisioningAllowed,
  seedDemoUsers,
} from "../src/services/demo/seedDemoUsers";
import {
  buildSystemsSearchText,
  countPendingChecklist,
  toPersistedCaseState,
} from "../src/services/persistence/caseMapper";
import { buildReportData } from "../src/services/reporting/reportBuilder";
import type { CaseStatus, ChecklistItem, ReportData } from "../src/domain/types";
import { Prisma } from "../src/generated/prisma/client";
import {
  buildBusinessContextUpdatedAudit,
  buildCaseCreatedAudit,
  buildChecklistCompletedAudit,
  buildHandoffAudit,
  buildHumanReviewUpdatedAudit,
  buildReportCreatedAudit,
  buildReportExportedAudit,
  buildStatusChangedAudit,
  type BuiltAuditEvent,
} from "../src/services/audit/auditEventBuilder";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** 固定演示时间（UTC+8），保证 Seed 幂等且时间单调 */
const T = {
  aCreated: new Date("2026-08-08T09:00:00+08:00"),
  aBusiness: new Date("2026-08-08T10:00:00+08:00"),
  aHuman: new Date("2026-08-08T10:20:00+08:00"),
  aReport: new Date("2026-08-08T10:30:00+08:00"),
  aClosed: new Date("2026-08-08T11:00:00+08:00"),
  aExport: new Date("2026-08-08T11:05:00+08:00"),
  bCreated: new Date("2026-08-08T09:10:00+08:00"),
  bChecklist: new Date("2026-08-08T09:35:00+08:00"),
  bStatus: new Date("2026-08-08T09:50:00+08:00"),
  bHandoff: new Date("2026-08-08T10:05:00+08:00"),
};

type SeedAuditSpec = {
  operationId: string;
  createdAt: Date;
  event: BuiltAuditEvent;
};

async function upsertSeedAudit(
  caseId: string,
  spec: SeedAuditSpec,
): Promise<void> {
  const { event, operationId, createdAt } = spec;
  const data = {
    caseId,
    actionType: event.actionType,
    actorType: event.actorType,
    actorId: event.actorId,
    actorName: event.actorName,
    summary: event.summary,
    changes: event.changes ? toJson(event.changes) : Prisma.DbNull,
    metadata: event.metadata ? toJson(event.metadata) : Prisma.DbNull,
    operationId,
  };

  await prisma.caseAuditLog.upsert({
    where: { operationId },
    create: {
      id: `seed-audit-${operationId.replace(/[:]/g, "-")}`,
      ...data,
      createdAt,
    },
    update: {
      ...data,
      // 保持确定性时间，避免重复 seed 刷成当前时间
      createdAt,
    },
  });
}

async function seedCaseAudits(
  caseId: string,
  specs: SeedAuditSpec[],
): Promise<Date> {
  const sorted = [...specs].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const spec of sorted) {
    await upsertSeedAudit(caseId, spec);
  }
  return sorted[sorted.length - 1]!.createdAt;
}

async function upsertDemoCase(input: {
  id: string;
  caseNumber: string;
  draft: typeof caseA;
  status: CaseStatus;
  withReport: boolean;
  /** 可选：在持久化前调整 checklist（须与 Audit Seed 一致） */
  transformChecklist?: (items: ChecklistItem[]) => ChecklistItem[];
  createdAt: Date;
  closedAt: Date | null;
  reportUpdatedAt: Date | null;
  lastActivityAt: Date;
}) {
  const analyzed = analyzeSecurityCase(input.draft);
  const checklist = input.transformChecklist
    ? input.transformChecklist(analyzed.checklist)
    : analyzed.checklist;
  const caseState = toPersistedCaseState({
    name: input.draft.name,
    createdAt: input.draft.createdAt,
    alert: input.draft.alert,
    dataContext: input.draft.dataContext,
    networkContext: input.draft.networkContext,
    identityContext: input.draft.identityContext,
    businessContext: input.draft.businessContext,
    checklist,
    humanReview: input.draft.humanReview,
    timeline: input.draft.timeline,
  });

  let reportDraft: ReportData | null = null;
  if (input.withReport) {
    const built = buildReportData({
      securityCase: {
        ...analyzed,
        checklist,
        humanReview: input.draft.humanReview,
        timeline: input.draft.timeline,
      },
      humanReview: input.draft.humanReview,
      checklist,
      timeline: input.draft.timeline,
    });
    reportDraft = {
      ...built,
      caseNumber: input.caseNumber,
      basicInfo: built.basicInfo.map((row) =>
        row.label === "案件编号"
          ? { ...row, value: input.caseNumber }
          : row,
      ),
    };
  }

  const data = {
    caseNumber: input.caseNumber,
    title: input.draft.name,
    status: input.status,
    suggestedRiskLevel:
      analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    humanRiskLevel: input.draft.humanReview?.humanRiskLevel ?? null,
    humanConclusion: input.draft.humanReview?.finalConclusion ?? null,
    username: input.draft.identityContext.accountName,
    sourceIp: input.draft.identityContext.loginSourceIp,
    systemsSearchText: buildSystemsSearchText(
      input.draft.identityContext.accessedSystems,
    ),
    pendingChecklistCount: countPendingChecklist(checklist),
    hasReport: Boolean(reportDraft),
    reportUpdatedAt: input.reportUpdatedAt,
    caseState: toJson(caseState),
    closedAt: input.closedAt,
    lastActivityAt: input.lastActivityAt,
    createdAt: input.createdAt,
  };

  await prisma.caseRecord.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      ...data,
      reportDraft: reportDraft ? toJson(reportDraft) : Prisma.DbNull,
    },
    update: {
      ...data,
      reportDraft: reportDraft ? toJson(reportDraft) : Prisma.DbNull,
    },
  });

  return {
    id: input.id,
    caseNumber: input.caseNumber,
    status: input.status,
    hasReport: data.hasReport,
    pendingChecklistCount: data.pendingChecklistCount,
    lastActivityAt: input.lastActivityAt,
  };
}

function caseAAuditSpecs(): SeedAuditSpec[] {
  const reviewer = "王研判";
  return [
    {
      operationId: "seed:v12:case-a:created",
      createdAt: T.aCreated,
      event: buildCaseCreatedAudit({
        caseNumber: "INC-20260808-001",
        title: caseA.name,
        sourceType: "DATABASE_AUDIT",
        operationId: "seed:v12:case-a:created",
      }),
    },
    {
      operationId: "seed:v12:case-a:business-confirmed",
      createdAt: T.aBusiness,
      event: buildBusinessContextUpdatedAudit({
        fields: ["businessLegitimacy", "ownerVerification", "changeTicketId"],
        enumChanges: {
          businessLegitimacy: { from: "UNKNOWN", to: "AUTHORIZED" },
          ownerVerification: { from: "UNKNOWN", to: "CONFIRMED" },
        },
        reviewer,
        operationId: "seed:v12:case-a:business-confirmed",
      }),
    },
    {
      operationId: "seed:v12:case-a:human-review",
      createdAt: T.aHuman,
      event: buildHumanReviewUpdatedAudit({
        finalConclusion: { from: null, to: "NORMAL_BUSINESS" },
        humanRiskLevel: { from: null, to: "LOW" },
        reviewer,
        operationId: "seed:v12:case-a:human-review",
      }),
    },
    {
      operationId: "seed:v12:case-a:report-created",
      createdAt: T.aReport,
      event: buildReportCreatedAudit({
        caseNumber: "INC-20260808-001",
        reviewer,
        operationId: "seed:v12:case-a:report-created",
      }),
    },
    {
      operationId: "seed:v12:case-a:closed",
      createdAt: T.aClosed,
      event: buildStatusChangedAudit({
        from: "INVESTIGATING",
        to: "CLOSED",
        reviewer,
        operationId: "seed:v12:case-a:closed",
      }),
    },
    {
      operationId: "seed:v12:case-a:report-exported",
      createdAt: T.aExport,
      event: buildReportExportedAudit({
        caseNumber: "INC-20260808-001",
        fileName: "INC-20260808-001-数据与网络安全事件调查分析报告.docx",
        reviewer,
        operationId: "seed:v12:case-a:report-exported",
      }),
    },
  ];
}

function caseBAuditSpecs(): SeedAuditSpec[] {
  const reviewer = "王研判";
  const handoffNote =
    "已完成账号基础核查，业务合理性尚未确认。已联系相关负责人，等待回复。下一班重点核查出口网络日志、异常公网通信及数据去向。";
  return [
    {
      operationId: "seed:v12:case-b:created",
      createdAt: T.bCreated,
      event: buildCaseCreatedAudit({
        caseNumber: "INC-20260808-002",
        title: caseB.name,
        sourceType: "MIXED",
        operationId: "seed:v12:case-b:created",
      }),
    },
    {
      operationId: "seed:v12:case-b:checklist-account",
      createdAt: T.bChecklist,
      event: buildChecklistCompletedAudit({
        itemId: "CL-8",
        label: "联系账号使用人确认是否本人操作",
        reviewer,
        operationId: "seed:v12:case-b:checklist-account",
      }),
    },
    {
      operationId: "seed:v12:case-b:status-pending",
      createdAt: T.bStatus,
      event: buildStatusChangedAudit({
        from: "INVESTIGATING",
        to: "PENDING_VERIFICATION",
        reviewer,
        operationId: "seed:v12:case-b:status-pending",
      }),
    },
    {
      operationId: "seed:v12:case-b:handoff",
      createdAt: T.bHandoff,
      event: buildHandoffAudit({
        note: handoffNote,
        reviewer,
        operationId: "seed:v12:case-b:handoff",
      }),
    },
  ];
}

async function main() {
  const aSpecs = caseAAuditSpecs();
  const bSpecs = caseBAuditSpecs();
  const aLast = aSpecs[aSpecs.length - 1]!.createdAt;
  const bLast = bSpecs[bSpecs.length - 1]!.createdAt;

  const a = await upsertDemoCase({
    id: "demo-case-a",
    caseNumber: "INC-20260808-001",
    draft: caseA,
    status: "CLOSED",
    withReport: true,
    createdAt: T.aCreated,
    closedAt: T.aClosed,
    reportUpdatedAt: T.aReport,
    lastActivityAt: aLast,
  });

  const b = await upsertDemoCase({
    id: "demo-case-b",
    caseNumber: "INC-20260808-002",
    draft: caseB,
    status: "PENDING_VERIFICATION",
    withReport: false,
    transformChecklist: (items) =>
      items.map((item) =>
        item.id === "CL-8" ? { ...item, completed: true } : item,
      ),
    createdAt: T.bCreated,
    closedAt: null,
    reportUpdatedAt: null,
    lastActivityAt: bLast,
  });

  await seedCaseAudits(a.id, aSpecs);
  await seedCaseAudits(b.id, bSpecs);

  // 再次对齐 lastActivityAt（与最新 Seed Audit 语义一致，不刷成 now）
  await prisma.caseRecord.update({
    where: { id: a.id },
    data: { lastActivityAt: aLast },
  });
  await prisma.caseRecord.update({
    where: { id: b.id },
    data: { lastActivityAt: bLast },
  });

  const aCount = await prisma.caseAuditLog.count({ where: { caseId: a.id } });
  const bCount = await prisma.caseAuditLog.count({ where: { caseId: b.id } });

  console.log("Demo Seed 完成（幂等）：");
  console.log(
    `  Case A ${a.caseNumber} status=${a.status} hasReport=${a.hasReport} pending=${a.pendingChecklistCount} audits=${aCount} lastActivityAt=${aLast.toISOString()}`,
  );
  console.log(
    `  Case B ${b.caseNumber} status=${b.status} hasReport=${b.hasReport} pending=${b.pendingChecklistCount} audits=${bCount} lastActivityAt=${bLast.toISOString()}`,
  );

  if (isDemoProvisioningAllowed()) {
    const demo = await seedDemoUsers();
    console.log(
      `  Demo Users：created=${demo.created.join(",") || "无"} skipped=${demo.skipped.join(",") || "无"}`,
    );
    console.log("  说明：Demo Users 仅开发/测试；口令见 DEMO_AUTH_PASSWORD / .env.example。");
  } else {
    console.log("  Demo Users：production 已跳过。");
  }
  console.log("  说明：Seed 中所有人员均为虚构 Demo 数据。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
