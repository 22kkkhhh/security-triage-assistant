/**
 * 生成 Case A / Case B 的 DOCX 验收样例到 samples/ 目录。
 * 复用正式的分析与 DOCX 生成链路，不单独实现测试逻辑。
 * 合规章节只消费 Snapshot（由 curated pack 内存图解析，不查运行时 DB）。
 * 运行：npm run generate:samples
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { caseA, caseB } from "../src/domain/demo";
import type { SecurityCase, SecurityCaseDraft } from "../src/domain/types";
import { analyzeSecurityCase } from "../src/services/analysis/analyzeSecurityCase";
import { curatedPackToResolutionGraph } from "../src/services/knowledge/pack/curatedPackToResolutionGraph";
import { resolveCaseComplianceFromGraph } from "../src/services/knowledge/resolveCaseCompliance";
import {
  buildDocxSpec,
  generateDocxBuffer,
  suggestDocxFileName,
} from "../src/services/reporting/docxGenerator";
import { FORBIDDEN_COMPLIANCE_REPORT_PHRASES } from "../src/services/reporting/complianceReportBuilder";
import { buildReportData } from "../src/services/reporting/reportBuilder";

/** 样例内容检查：不得泄露内部枚举值或确定性攻击措辞 */
const FORBIDDEN =
  /\bUNKNOWN\b|\bABNORMAL\b|\bNORMAL\b|null|undefined|确认(遭到)?(黑客)?攻击|已被攻破|已失陷|已确认(数据)?泄露|已成功入侵/;

const CAPTURED_AT = "2026-08-09T12:00:00.000Z";
const knowledgeGraph = curatedPackToResolutionGraph();

async function generateOne(draft: SecurityCaseDraft): Promise<void> {
  const securityCase: SecurityCase = analyzeSecurityCase(draft);
  const resolved = resolveCaseComplianceFromGraph(
    {
      draft,
      analysisResults: securityCase.analysisResults,
      evidences: securityCase.evidences,
      capturedAt: CAPTURED_AT,
    },
    knowledgeGraph,
  );

  const report = buildReportData({
    securityCase,
    humanReview: securityCase.humanReview,
    checklist: securityCase.checklist,
    timeline: securityCase.timeline,
    complianceReferences: resolved.snapshots,
  });

  const spec = buildDocxSpec(report, {
    evidences: securityCase.evidences,
    timeline: securityCase.timeline,
  });
  const specText = JSON.stringify(spec);
  const violations = specText.match(FORBIDDEN);
  if (violations) {
    throw new Error(
      `${securityCase.name} 样例内容检查未通过，出现禁止措辞：${violations[0]}`,
    );
  }
  const complianceText = report.sections
    .filter((s) => s.key.startsWith("compliance"))
    .map((s) => s.content)
    .join("\n");
  if (FORBIDDEN_COMPLIANCE_REPORT_PHRASES.test(complianceText)) {
    throw new Error(`${securityCase.name} 合规章节出现禁止违法/违规措辞`);
  }

  const buffer = await generateDocxBuffer(report, {
    evidences: securityCase.evidences,
    timeline: securityCase.timeline,
  });
  const fileName = suggestDocxFileName(report);
  const outputPath = path.join("samples", fileName);
  await writeFile(outputPath, buffer);
  console.log(`已生成：${outputPath}（${buffer.length} 字节）`);
  console.log(
    `  合规章节：relevant/possible/further = ${
      report.sections.filter((s) => s.key.startsWith("compliance")).length
    }；snapshots=${report.complianceReferences?.length ?? 0}`,
  );
}

await mkdir("samples", { recursive: true });
await generateOne(caseA);
await generateOne(caseB);
console.log("样例生成完成，内容检查通过（仅含 Mock 数据）。");
