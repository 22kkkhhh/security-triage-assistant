/**
 * v1.1 最终烟测（服务层 + 与浏览器刷新等价的重读）。
 * 在 Demo Case A/B 上验证；结束后将 DB 复位为干净 Seed。
 */
import { createCaseAction } from "../src/app/(app)/cases/actions";
import { parsePastedText } from "../src/services/normalization/textParser";
import {
  getCaseById,
  listCases,
  listReportCases,
  saveCaseState,
  saveReportDraft,
} from "../src/services/persistence/caseRepository";
import {
  getOrCreateReportDraft,
  getReportExportPayload,
} from "../src/services/persistence/reportDraftService";
import { generateDocxBuffer } from "../src/services/reporting/docxGenerator";
import { restoreWorkbenchFromPersisted } from "../src/services/persistence/restoreWorkbench";
import { execSync } from "node:child_process";

async function main() {
  // FLOW A：Case A checklist 修改 → 保存 → 重读
  const caseA = await getCaseById("demo-case-a");
  if (!caseA) throw new Error("缺少 Case A seed");
  const reportAtBefore = caseA.reportUpdatedAt;
  const nextChecklist = caseA.caseState.checklist.map((item, i) =>
    i === 0 ? { ...item, completed: true, note: "v11-smoke-a" } : item,
  );
  await saveCaseState(caseA.id, {
    caseData: caseA.caseState.caseData,
    businessContext: caseA.caseState.businessContext,
    checklist: nextChecklist,
    humanReview: caseA.caseState.humanReview,
    timeline: caseA.caseState.timeline,
    suggestedRiskLevel: caseA.suggestedRiskLevel,
    status: caseA.status,
  });
  const a2 = await getCaseById(caseA.id);
  if (!a2?.caseState.checklist.some((i) => i.note === "v11-smoke-a")) {
    throw new Error("FLOW A checklist 未保持");
  }
  if (a2.reportUpdatedAt !== reportAtBefore) {
    throw new Error("FLOW A 不应改动 reportUpdatedAt");
  }
  const listedA = await listCases({ search: "INC-20260808-001" });
  if (listedA[0]?.pendingChecklistCount !== a2.pendingChecklistCount) {
    throw new Error("FLOW A 列表 pending 未同步");
  }

  // FLOW B：文本新建 → 修改 → 重读 → 搜索
  const text = parsePastedText(
    [
      "告警名称：v1.1最终烟测告警",
      "告警时间：2026-08-08 03:00",
      "账号：smoke_v11_user",
      "源IP：10.40.1.8",
      "访问系统：CRM_PROD",
    ].join("\n"),
    "DATABASE_AUDIT",
  ).input;
  const created = await createCaseAction(text);
  if (!created.ok) throw new Error(created.error);
  const createdCase = await getCaseById(created.id);
  await saveCaseState(created.id, {
    caseData: createdCase!.caseState.caseData,
    businessContext: {
      ...createdCase!.caseState.businessContext,
      businessJustification: "v11-smoke-bc",
    },
    checklist: createdCase!.caseState.checklist,
    humanReview: {
      reviewer: "王研判",
      finalConclusion: "INCONCLUSIVE",
      humanRiskLevel: "MEDIUM",
      conclusionNote: "v11-smoke-human",
      adjustments: [],
      confirmedAt: "2026-08-08T21:00:00+08:00",
    },
    timeline: [
      ...createdCase!.caseState.timeline,
      {
        id: "v11-tl",
        occurredAt: "2026-08-08T21:05:00+08:00",
        eventType: "人工处置",
        title: "烟测记录",
        description: "v11-smoke-timeline",
        operator: "王研判",
        source: "HUMAN",
      },
    ],
    suggestedRiskLevel: createdCase!.suggestedRiskLevel,
    status: "INVESTIGATING",
  });
  const reloaded = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
  if (reloaded.draft.businessContext.businessJustification !== "v11-smoke-bc") {
    throw new Error("FLOW B BC 丢失");
  }
  if (reloaded.draft.humanReview?.conclusionNote !== "v11-smoke-human") {
    throw new Error("FLOW B HumanReview 丢失");
  }
  if (!reloaded.draft.timeline.some((e) => e.id === "v11-tl")) {
    throw new Error("FLOW B Timeline 丢失");
  }
  const found = await listCases({ search: "smoke_v11_user" });
  if (!found.some((i) => i.id === created.id)) throw new Error("FLOW B 搜索失败");

  // FLOW C：Case B 报告修改 → 重开不覆盖 → DOCX
  const caseB = await getCaseById("demo-case-b");
  if (!caseB) throw new Error("缺少 Case B seed");
  const report = await getOrCreateReportDraft(caseB.id);
  const marker = "本段已由研判人员人工补充。";
  await saveReportDraft(caseB.id, {
    ...report!.report,
    sections: report!.report.sections.map((s) =>
      s.key === "overview" ? { ...s, content: marker } : s,
    ),
  });
  // 改案件不应覆盖报告
  await saveCaseState(caseB.id, {
    caseData: caseB.caseState.caseData,
    businessContext: {
      ...caseB.caseState.businessContext,
      businessJustification: "案件侧更新",
    },
    checklist: caseB.caseState.checklist,
    humanReview: caseB.caseState.humanReview,
    timeline: caseB.caseState.timeline,
    suggestedRiskLevel: caseB.suggestedRiskLevel,
    status: caseB.status,
  });
  const report2 = await getOrCreateReportDraft(caseB.id);
  if (report2!.freshlyCreated) throw new Error("FLOW C 不应重建");
  if (
    report2!.report.sections.find((s) => s.key === "overview")?.content !==
    marker
  ) {
    throw new Error("FLOW C 概述被覆盖");
  }
  const payload = await getReportExportPayload(caseB.id);
  const buffer = await generateDocxBuffer(
    payload!.report,
    { evidences: payload!.evidences, timeline: payload!.timeline },
    { maskSensitive: true },
  );
  const JSZip = (await import("jszip")).default;
  const xml = await (await JSZip.loadAsync(buffer))
    .file("word/document.xml")!
    .async("string");
  if (!xml.includes(marker)) throw new Error("FLOW C DOCX 缺少人工文字");

  // FLOW D：报告中心
  const reports = await listReportCases();
  if (!reports.some((r) => r.id === "demo-case-a")) {
    throw new Error("FLOW D Case A 不在报告中心");
  }
  if (!reports.some((r) => r.id === caseB.id && r.hasReport)) {
    throw new Error("FLOW D Case B 报告未出现");
  }
  if (!reports.every((r) => r.reportUpdatedAt)) {
    throw new Error("FLOW D 缺少 reportUpdatedAt");
  }

  // 清理新建烟测案件后复位 Demo（保证面试数据干净）
  const { prisma } = await import("../src/lib/prisma");
  await prisma.caseRecord.delete({ where: { id: created.id } });
  await prisma.$disconnect();
  execSync("npm run db:seed", { stdio: "inherit" });

  console.log(
    JSON.stringify(
      {
        ok: true,
        flowA: true,
        flowB: true,
        flowC: true,
        flowD: true,
        docxBytes: buffer.byteLength,
        testsHint: "browser HTTP smoke separately",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
