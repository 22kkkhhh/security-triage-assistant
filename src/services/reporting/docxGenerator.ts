import {
  AlignmentType,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { evidenceSourceTypeLabels } from "@/domain/labels";
import type { Evidence, ReportData, TimelineEvent } from "@/domain/types";
import { maskSensitiveText } from "./masking";
import { formatDateTime, normalizeDateTimesInText } from "./timeFormat";

/**
 * DOCX 生成器：独立于 React 页面。
 * 排版目标：企业内部安全事件调查分析报告（专业、清晰、克制）。
 * 架构预留：options.template 允许未来扩展企业模板，本阶段不实现模板后台。
 */

export interface GenerateDocxOptions {
  /** 是否对报告文本应用敏感信息脱敏，默认 true */
  maskSensitive?: boolean;
  /** 预留：企业模板标识，本阶段未实现 */
  template?: string;
}

export interface DocxContext {
  evidences: Evidence[];
  timeline: TimelineEvent[];
}

export type ParagraphVariant =
  | "body" // 正文：首行缩进两字符，1.45 倍行距
  | "meta" // 辅助说明：深灰小字
  | "ruleTitle" // 规则标题：加粗
  | "listItem" // 列表项：无缩进，项间留白
  | "keyLine"; // 结论关键行：加粗

export type DocxBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; variant?: ParagraphVariant }
  | {
      kind: "table";
      header: string[];
      rows: string[][];
      /** 列宽百分比，合计 100 */
      widths: number[];
      /** 需要拆成“日期 / 时间”两行显示的列序号 */
      twoLineTimeColumns?: number[];
    };

export interface DocxSpec {
  title: string;
  caseNumber: string;
  blocks: DocxBlock[];
}

/** 规则行模式：【规则标题】状态（风险等级）：解释 */
const RULE_LINE =
  /^【(.+?)】(当前未发现明显异常|存在异常特征|暂缺少相关信息，当前无法判断)（(.+?)）：([\s\S]*)$/;

/** 把报告数据转换为与排版无关的文档结构（纯函数，便于测试） */
export function buildDocxSpec(
  report: ReportData,
  context: DocxContext,
  options: GenerateDocxOptions = {},
): DocxSpec {
  const mask = options.maskSensitive !== false;
  const text = (value: string) => {
    // 统一时间格式，再按需脱敏
    const normalized = normalizeDateTimesInText(value);
    return mask ? maskSensitiveText(normalized) : normalized;
  };

  const blocks: DocxBlock[] = [];

  blocks.push({ kind: "heading", text: "基本信息" });
  blocks.push({
    kind: "table",
    header: ["项目", "内容"],
    widths: [22, 78],
    rows: report.basicInfo.map((row) => [row.label, text(row.value)]),
  });

  for (const section of report.sections) {
    blocks.push({ kind: "heading", text: section.title });

    for (const line of section.content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const ruleMatch = RULE_LINE.exec(trimmed);
      if (ruleMatch) {
        // 规则名称 / 风险等级 / 状态 / 解释分层展示
        blocks.push({
          kind: "paragraph",
          text: `【${ruleMatch[1]}】 ${ruleMatch[3]}`,
          variant: "ruleTitle",
        });
        blocks.push({
          kind: "paragraph",
          text: ruleMatch[2],
          variant: "meta",
        });
        blocks.push({ kind: "paragraph", text: text(ruleMatch[4]), variant: "body" });
        continue;
      }
      if (/^\d+\.\s/.test(trimmed)) {
        blocks.push({ kind: "paragraph", text: text(trimmed), variant: "listItem" });
        continue;
      }
      if (
        section.key === "conclusion" &&
        /^(最终结论|人工风险等级|研判人员)：/.test(trimmed)
      ) {
        blocks.push({ kind: "paragraph", text: text(trimmed), variant: "keyLine" });
        continue;
      }
      blocks.push({ kind: "paragraph", text: text(trimmed), variant: "body" });
    }

    if (section.key === "evidenceIntro") {
      const evidences = context.evidences.filter((e) =>
        report.evidenceIds.includes(e.evidenceId),
      );
      blocks.push({
        kind: "table",
        header: ["证据编号", "来源", "时间", "证据摘要"],
        widths: [16, 16, 20, 48],
        twoLineTimeColumns: [2],
        rows: evidences.map((e) => [
          e.evidenceId,
          evidenceSourceTypeLabels[e.sourceType],
          formatDateTime(e.timestamp),
          `${text(e.summary)}\n关联规则：${e.relatedRuleId}`,
        ]),
      });
    }

    if (section.key === "timelineIntro") {
      const events = context.timeline.filter((event) =>
        report.timelineEventIds.includes(event.id),
      );
      blocks.push({
        kind: "table",
        header: ["时间", "操作人员", "事件类型", "说明"],
        widths: [20, 16, 14, 50],
        twoLineTimeColumns: [0],
        rows: events.map((event) => [
          formatDateTime(event.occurredAt),
          event.operator ?? (event.source === "SYSTEM" ? "系统" : "（未填写）"),
          event.eventType,
          text(event.description),
        ]),
      });
    }
  }

  return { title: text(report.title), caseNumber: report.caseNumber, blocks };
}

/* ---------------- 排版常量 ---------------- */

const FONT_TITLE = { ascii: "Microsoft YaHei", eastAsia: "Microsoft YaHei", hAnsi: "Microsoft YaHei" };
const FONT_HEADING = FONT_TITLE;
const FONT_BODY = { ascii: "SimSun", eastAsia: "SimSun", hAnsi: "SimSun" };

const COLOR_GRAY = "595959";
const COLOR_LIGHT_GRAY = "808080";
const COLOR_HEADER_FILL = "F2F2F2";

/** A4 纵向，页边距：上下 2.4cm，左右 2.5cm（1cm ≈ 567 twips） */
const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1361, bottom: 1361, left: 1417, right: 1417 },
};
/** 可用版心宽度（twips） */
const CONTENT_WIDTH = 11906 - 1417 - 1417;

const CELL_MARGINS = { top: 90, bottom: 90, left: 110, right: 110 };

function bodyParagraph(
  block: Extract<DocxBlock, { kind: "paragraph" }>,
): Paragraph {
  const variant = block.variant ?? "body";
  switch (variant) {
    case "ruleTitle":
      return new Paragraph({
        keepNext: true,
        spacing: { before: 120, after: 60, line: 348, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({ text: block.text, bold: true, size: 22, font: FONT_HEADING }),
        ],
      });
    case "meta":
      return new Paragraph({
        keepNext: true,
        spacing: { after: 40, line: 348, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({ text: block.text, size: 21, color: COLOR_GRAY, font: FONT_BODY }),
        ],
      });
    case "listItem":
      return new Paragraph({
        spacing: { after: 70, line: 348, lineRule: LineRuleType.AUTO },
        indent: { left: 220 },
        children: [new TextRun({ text: block.text, size: 22, font: FONT_BODY })],
      });
    case "keyLine":
      return new Paragraph({
        spacing: { after: 110, line: 348, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({ text: block.text, bold: true, size: 23, font: FONT_BODY }),
        ],
      });
    default:
      return new Paragraph({
        spacing: { after: 110, line: 348, lineRule: LineRuleType.AUTO },
        indent: { firstLine: 440 },
        children: [new TextRun({ text: block.text, size: 22, font: FONT_BODY })],
      });
  }
}

function headingParagraph(text: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 300, after: 150 },
    children: [
      new TextRun({ text, bold: true, size: 28, font: FONT_HEADING }),
    ],
  });
}

function cellParagraphs(text: string, isHeader: boolean): Paragraph[] {
  return text.split("\n").map((line, index) => {
    if (isHeader) {
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: line, bold: true, size: 21, font: FONT_HEADING }),
        ],
      });
    }
    // 单元格内第二行起为辅助信息（如“关联规则：X”），小号深灰
    const isSub = index > 0;
    return new Paragraph({
      spacing: { after: 20, line: 300, lineRule: LineRuleType.AUTO },
      children: [
        new TextRun({
          text: line,
          size: isSub ? 18 : 20,
          color: isSub ? COLOR_GRAY : "000000",
          font: FONT_BODY,
        }),
      ],
    });
  });
}

function buildTable(
  block: Extract<DocxBlock, { kind: "table" }>,
): Table {
  const columnWidths = block.widths.map((p) =>
    Math.round((CONTENT_WIDTH * p) / 100),
  );

  const headerRow = new TableRow({
    tableHeader: true, // 跨页时重复表头
    cantSplit: true,
    children: block.header.map(
      (cell, index) =>
        new TableCell({
          width: { size: columnWidths[index], type: WidthType.DXA },
          shading: { fill: COLOR_HEADER_FILL },
          margins: CELL_MARGINS,
          verticalAlign: VerticalAlign.CENTER,
          children: cellParagraphs(cell, true),
        }),
    ),
  });

  const bodyRows = block.rows.map(
    (row) =>
      new TableRow({
        cantSplit: true, // 避免一条记录被拆到两页
        children: row.map((cell, index) => {
          // 时间列拆成“日期 / 时间”两行自然显示
          const display =
            block.twoLineTimeColumns?.includes(index) && cell.includes(" ")
              ? cell.replace(" ", "\n")
              : cell;
          return new TableCell({
            width: { size: columnWidths[index], type: WidthType.DXA },
            margins: CELL_MARGINS,
            verticalAlign: VerticalAlign.CENTER,
            children: cellParagraphs(display, false),
          });
        }),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    rows: [headerRow, ...bodyRows],
  });
}

const CN_NUMERALS = [
  "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五",
];

function buildDocument(spec: DocxSpec): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: "数据与网络安全事件调查分析报告",
          bold: true,
          size: 42, // 21pt
          font: FONT_TITLE,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: spec.caseNumber, size: 21, color: COLOR_GRAY, font: FONT_HEADING }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: "演示说明：本报告中的账号、IP、人员、系统及事件数据均为虚构，仅用于功能演示。",
          size: 18,
          color: COLOR_LIGHT_GRAY,
          font: FONT_BODY,
        }),
      ],
    }),
  ];

  let headingIndex = 0;
  for (const block of spec.blocks) {
    if (block.kind === "heading") {
      const numeral = CN_NUMERALS[headingIndex] ?? `${headingIndex + 1}`;
      headingIndex += 1;
      children.push(headingParagraph(`${numeral}、${block.text}`));
    } else if (block.kind === "paragraph") {
      children.push(bodyParagraph(block));
    } else {
      children.push(buildTable(block));
      // 表格后补一个空段，避免与下一标题紧贴
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: "", size: 20 })],
        }),
      );
    }
  }

  return new Document({ sections: [{ properties: { page: PAGE }, children }] });
}

/** 建议的导出文件名 */
export function suggestDocxFileName(report: ReportData): string {
  return `${report.caseNumber}-数据与网络安全事件调查分析报告.docx`;
}

/** Node/测试环境：生成 Buffer */
export async function generateDocxBuffer(
  report: ReportData,
  context: DocxContext,
  options: GenerateDocxOptions = {},
): Promise<Buffer> {
  return Packer.toBuffer(buildDocument(buildDocxSpec(report, context, options)));
}

/** 浏览器环境：生成 Blob 供下载 */
export async function generateDocxBlob(
  report: ReportData,
  context: DocxContext,
  options: GenerateDocxOptions = {},
): Promise<Blob> {
  return Packer.toBlob(buildDocument(buildDocxSpec(report, context, options)));
}
