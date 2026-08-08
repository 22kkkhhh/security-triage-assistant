/**
 * Step 5 烟测：生成报告 → 修改 → 保存 → 重开不覆盖 → 导出 DOCX → 报告中心可见。
 * 结束后清理本脚本创建的案件。
 */
import { caseB } from "../src/domain/demo/caseB";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import { prisma } from "../src/lib/prisma";
import {
  createCase,
  listReportCases,
  saveCaseState,
  saveReportDraft,
} from "../src/services/persistence/caseRepository";
import {
  getOrCreateReportDraft,
  getReportExportPayload,
} from "../src/services/persistence/reportDraftService";
import { generateDocxBuffer } from "../src/services/reporting/docxGenerator";
import { buildReportData } from "../src/services/reporting/reportBuilder";

async function main() {
  const analyzed = analyzeSecurityCase(caseB);
  const created = await createCase({
    draft: caseB,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });

  const first = await getOrCreateReportDraft(created.id);
  if (!first?.freshlyCreated) throw new Error("首次应生成报告");

  const marker = "SMOKE5-OVERVIEW-EDIT";
  const edited = {
    ...first.report,
    title: "SMOKE5-TITLE",
    sections: first.report.sections.map((s) =>
      s.key === "overview" ? { ...s, content: marker } : s,
    ),
  };
  await saveReportDraft(created.id, edited);

  // 修改案件 BusinessContext 后再次打开报告，不得覆盖
  await saveCaseState(created.id, {
    caseData: created.caseState.caseData,
    businessContext: {
      ...created.caseState.businessContext,
      businessJustification: "案件侧已更新-不应写入报告",
    },
    checklist: created.caseState.checklist,
    humanReview: created.caseState.humanReview,
    timeline: created.caseState.timeline,
    suggestedRiskLevel: created.suggestedRiskLevel,
  });

  const reopened = await getOrCreateReportDraft(created.id);
  if (reopened!.freshlyCreated) throw new Error("不应重新生成");
  if (reopened!.report.title !== "SMOKE5-TITLE") throw new Error("标题被覆盖");
  if (
    reopened!.report.sections.find((s) => s.key === "overview")?.content !==
    marker
  ) {
    throw new Error("概述被覆盖");
  }

  const payload = await getReportExportPayload(created.id);
  if (!payload) throw new Error("导出载荷缺失");
  // 证明未临时 build：临时 build 的 title 会是 caseB.name
  const temp = buildReportData({
    securityCase: analyzed,
    humanReview: caseB.humanReview,
    checklist: analyzed.checklist,
    timeline: caseB.timeline,
  });
  if (payload.report.title === temp.title) {
    throw new Error("导出疑似使用了临时 buildReportData");
  }

  const buffer = await generateDocxBuffer(
    payload.report,
    { evidences: payload.evidences, timeline: payload.timeline },
    { maskSensitive: true },
  );
  if (buffer.byteLength < 1000) throw new Error("DOCX 过小");

  const listed = await listReportCases();
  if (!listed.some((item) => item.id === created.id)) {
    throw new Error("报告中心未找到");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        caseId: created.id,
        caseNumber: created.caseNumber,
        reportTitle: reopened!.report.title,
        overview: marker,
        docxBytes: buffer.byteLength,
        inReportCenter: true,
      },
      null,
      2,
    ),
  );

  await prisma.caseRecord.delete({ where: { id: created.id } });
  console.log("cleaned smoke case");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
