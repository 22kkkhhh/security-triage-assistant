/**
 * Demo 种子：仅写入 Case A / Case B（虚构 Mock 数据）。
 * 固定 id / caseNumber，可重复执行（upsert 幂等）。
 * 运行：npm run db:seed
 */
import "dotenv/config";
import { caseA, caseB } from "../src/domain/demo";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import { prisma } from "../src/lib/prisma";
import {
  buildSystemsSearchText,
  countPendingChecklist,
  toPersistedCaseState,
} from "../src/services/persistence/caseMapper";
import { buildReportData } from "../src/services/reporting/reportBuilder";
import type { CaseStatus, ReportData } from "../src/domain/types";
import { Prisma } from "../src/generated/prisma/client";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function upsertDemoCase(input: {
  id: string;
  caseNumber: string;
  draft: typeof caseA;
  status: CaseStatus;
  withReport: boolean;
}) {
  const analyzed = analyzeSecurityCase(input.draft);
  const checklist = analyzed.checklist;
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
  let reportUpdatedAt: Date | null = null;
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
    reportUpdatedAt = new Date("2026-08-08T10:30:00+08:00");
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
    reportUpdatedAt,
    caseState: toJson(caseState),
    closedAt: input.status === "CLOSED" ? new Date("2026-08-08T11:00:00+08:00") : null,
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
  };
}

async function main() {
  const a = await upsertDemoCase({
    id: "demo-case-a",
    caseNumber: "INC-20260808-001",
    draft: caseA,
    status: "CLOSED",
    withReport: true,
  });
  const b = await upsertDemoCase({
    id: "demo-case-b",
    caseNumber: "INC-20260808-002",
    draft: caseB,
    status: "PENDING_VERIFICATION",
    withReport: false,
  });

  console.log("Demo Seed 完成（幂等）：");
  console.log(
    `  Case A ${a.caseNumber} status=${a.status} hasReport=${a.hasReport} pending=${a.pendingChecklistCount}`,
  );
  console.log(
    `  Case B ${b.caseNumber} status=${b.status} hasReport=${b.hasReport} pending=${b.pendingChecklistCount}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
