import {
  businessLegitimacyLabels,
  displayRiskLevel,
  existenceStatusLabels,
  finalConclusionLabels,
  riskLevelLabels,
  verificationStatusLabels,
} from "@/domain/labels";
import type {
  AnalysisResult,
  ChecklistItem,
  HumanReview,
  ObservationStatus,
  ReportData,
  ReportSection,
  SecurityCase,
  SecurityDomain,
  TimelineEvent,
} from "@/domain/types";
import { formatDateTime, normalizeDateTimesInText } from "./timeFormat";

/** 报告正文使用的正式中文措辞，内部枚举值不得直接进入正文 */
const reportStatusText: Record<ObservationStatus, string> = {
  NORMAL: "当前未发现明显异常",
  ABNORMAL: "存在异常特征",
  UNKNOWN: "暂缺少相关信息，当前无法判断",
};

/**
 * Report Builder：把 SecurityCase（含规则分析结果）转换为报告初稿。
 * - 与 UI、DOCX 排版完全分离，纯函数；
 * - 自动生成内容仅为初稿，最终报告必须允许人工修改；
 * - 结论章节来自 HumanReview，SuggestedAssessment 只作为“初步分析”出现；
 * - 禁止生成“确认攻击 / 已失陷 / 已泄露”类确定性结论。
 */

export interface BuildReportInput {
  securityCase: SecurityCase;
  humanReview: HumanReview | null;
  checklist: ChecklistItem[];
  timeline: TimelineEvent[];
}

const sectionTitles: Record<ReportSection["key"], string> = {
  overview: "事件概述",
  rawAlert: "原始告警信息",
  dataAnalysis: "数据安全分析",
  networkAnalysis: "网络安全分析",
  identityAnalysis: "身份行为分析",
  businessReview: "业务合理性核查",
  evidenceIntro: "研判依据与证据",
  checklistSummary: "核查情况",
  timelineIntro: "事件处置过程",
  impactAnalysis: "影响分析",
  conclusion: "人工研判结论",
  recommendations: "整改建议",
};

/** 报告案件编号：INC-YYYYMMDD-XXX */
export function buildCaseNumber(securityCase: SecurityCase): string {
  const dateText = securityCase.alert.occurredAt ?? securityCase.createdAt;
  const date = dateText.slice(0, 10).replaceAll("-", "");
  let seq = "101";
  if (securityCase.id === "demo-case-a") seq = "001";
  else if (securityCase.id === "demo-case-b") seq = "002";
  else {
    const match = /(\d+)$/.exec(securityCase.id);
    if (match) seq = `1${match[1].padStart(2, "0")}`;
  }
  return `INC-${date}-${seq}`;
}

function joinRuleExplanations(
  results: AnalysisResult[],
  category: SecurityDomain,
): string {
  const rs = results.filter((r) => r.category === category);
  if (rs.length === 0) return "当前缺少该维度的分析数据。";
  return rs
    .map(
      (r) =>
        `【${r.title}】${reportStatusText[r.status]}（${displayRiskLevel(r.status, r.riskLevel)}）：${r.explanation}`,
    )
    .join("\n");
}

export function buildReportData(input: BuildReportInput): ReportData {
  const { securityCase, humanReview, checklist, timeline } = input;
  const {
    alert,
    dataContext,
    networkContext,
    identityContext,
    businessContext,
    analysisResults,
    evidences,
    suggestedAssessment,
  } = securityCase;

  const abnormalResults = analysisResults.filter((r) => r.status === "ABNORMAL");
  const authorized = businessContext.businessLegitimacy === "AUTHORIZED";

  const baseline = dataContext.baseline;
  const baselineText =
    dataContext.accessedRecordCount !== null &&
    baseline?.averageRecordCount != null &&
    baseline.averageRecordCount > 0
      ? `本次访问量 ${dataContext.accessedRecordCount.toLocaleString()} 行，历史${baseline.observationDays !== null && baseline.observationDays !== undefined ? ` ${baseline.observationDays} 日` : ""}平均 ${baseline.averageRecordCount.toLocaleString()} 行，偏离约 ${(dataContext.accessedRecordCount / baseline.averageRecordCount).toFixed(1)} 倍。`
      : "历史基线或本次访问数据不足，暂无法计算偏离倍数。";

  const incompleteItems = checklist.filter((item) => !item.completed);

  // 整改建议随人工最终结论变化：授权业务场景偏向流程与策略优化，
  // 疑似安全事件场景偏向取证与进一步核查；任何场景都不得直接认定攻击成立。
  let recommendedActions: string[];
  if (humanReview?.finalConclusion === "NORMAL_BUSINESS") {
    recommendedActions = [
      "完善变更工单与敏感操作的关联管理",
      "将已授权的批量任务纳入白名单，减少同类告警误报",
      "完善夜间计划任务的备案与通知机制",
      "保留本次核查记录，便于后续审计追溯",
      "优化类似告警的触发策略与阈值",
    ];
  } else if (humanReview?.finalConclusion === "SUSPECTED_SECURITY_INCIDENT") {
    recommendedActions = [
      "联系并核实涉事账号的实际使用人",
      "保全相关认证、数据库与网络日志，避免证据丢失",
      "核查异常公网通信的对端归属与通信内容",
      "核查敏感数据是否被导出及去向",
      "必要时按预案限制涉事账号与来源的访问",
      "建议升级为安全事件，开展进一步调查",
    ];
  } else {
    recommendedActions = [
      ...new Set([
        ...incompleteItems.map((item) => item.label),
        ...(suggestedAssessment?.recommendedNextActions ?? []),
      ]),
    ];
  }

  const generatedAt = new Date().toISOString();

  const conclusionText = humanReview?.finalConclusion
    ? [
        `最终结论：${finalConclusionLabels[humanReview.finalConclusion]}`,
        humanReview.humanRiskLevel
          ? `人工风险等级：${riskLevelLabels[humanReview.humanRiskLevel]}`
          : null,
        humanReview.conclusionNote
          ? `研判说明：${humanReview.conclusionNote}`
          : null,
        humanReview.reviewer ? `研判人员：${humanReview.reviewer}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n")
    : "尚未形成人工研判结论，请先在研判工作台完成人工确认后再定稿报告。";

  const impactText = authorized
    ? "经业务核实，本次行为属于授权业务操作，未发现充分证据证明存在数据外泄或安全事件影响。"
    : abnormalResults.length > 0
      ? "当前证据显示存在异常行为，暂无法排除数据泄露风险，实际影响范围尚需进一步核查；本报告不对影响范围作确定性断言。"
      : "当前证据未见明显异常影响；如后续补充数据，结论可能调整。";

  const sections: ReportSection[] = [
    {
      key: "overview",
      title: sectionTitles.overview,
      content: `${alert.title}。告警时间：${alert.occurredAt ?? "（无数据）"}；告警来源：${alert.source}。\n系统初步分析（仅供辅助研判）：${suggestedAssessment?.summary ?? "（无系统建议）"}`,
    },
    {
      key: "rawAlert",
      title: sectionTitles.rawAlert,
      content: `告警编号：${alert.originalAlertId ?? "（无数据）"}\n告警标题：${alert.title}\n告警级别：${alert.severity ? riskLevelLabels[alert.severity] : "（无数据）"}\n告警描述：${alert.description || "（无数据）"}`,
    },
    {
      key: "dataAnalysis",
      title: sectionTitles.dataAnalysis,
      content: `涉及对象：${dataContext.databaseName ?? "未知库"}.${dataContext.tableName ?? "未知表"}；涉及敏感字段：${dataContext.sensitiveFieldTypes.join("、") || "（无数据）"}。${baselineText}\n${joinRuleExplanations(analysisResults, "DATA")}`,
    },
    {
      key: "networkAnalysis",
      title: sectionTitles.networkAnalysis,
      content: `内网来源：${networkContext.internalSourceIp ?? "（无数据）"}；外部通信对端：${networkContext.externalDestination ?? "（无数据）"}；出站流量：${networkContext.outboundTransferBytes === null ? "（无数据）" : `约 ${Math.round(networkContext.outboundTransferBytes / 1024 / 1024)}MB`}。\n${joinRuleExplanations(analysisResults, "NETWORK")}`,
    },
    {
      key: "identityAnalysis",
      title: sectionTitles.identityAnalysis,
      content: `涉及账号：${identityContext.accountName ?? "（无数据）"}；登录来源：${identityContext.loginSourceIp ?? "（无数据）"}；连续失败认证次数：${identityContext.failedLoginAttempts ?? "（无数据）"}；涉及业务系统：${identityContext.accessedSystems.join("、") || "（无数据）"}。\n${joinRuleExplanations(analysisResults, "IDENTITY")}`,
    },
    {
      key: "businessReview",
      title: sectionTitles.businessReview,
      content: `计划任务：${existenceStatusLabels[businessContext.plannedTaskStatus]}；变更工单：${existenceStatusLabels[businessContext.changeTicketStatus]}${businessContext.changeTicketId ? `（${businessContext.changeTicketId}）` : ""}；业务负责人：${businessContext.businessOwner ?? "（无数据）"}；负责人确认：${verificationStatusLabels[businessContext.ownerVerification]}；业务合理性：${businessLegitimacyLabels[businessContext.businessLegitimacy]}。${businessContext.businessJustification ?? ""}\n${joinRuleExplanations(analysisResults, "BUSINESS")}`,
    },
    {
      key: "evidenceIntro",
      title: sectionTitles.evidenceIntro,
      content: `本报告共引用 ${evidences.length} 条证据，均以脱敏摘要形式列出，不包含原始敏感日志全文。`,
    },
    {
      key: "checklistSummary",
      title: sectionTitles.checklistSummary,
      content: `本次研判共生成核查事项 ${checklist.length} 项，已完成 ${checklist.length - incompleteItems.length} 项，未完成 ${incompleteItems.length} 项。${incompleteItems.length > 0 ? `\n未完成事项：${incompleteItems.map((item) => item.label).join("；")}。` : ""}`,
    },
    {
      key: "timelineIntro",
      title: sectionTitles.timelineIntro,
      content: `事件处置过程共记录 ${timeline.length} 条（含人工处置记录），详见下表。`,
    },
    {
      key: "impactAnalysis",
      title: sectionTitles.impactAnalysis,
      content: impactText,
    },
    {
      key: "conclusion",
      title: sectionTitles.conclusion,
      content: conclusionText,
    },
    {
      key: "recommendations",
      title: sectionTitles.recommendations,
      content:
        recommendedActions.length > 0
          ? recommendedActions.map((action, i) => `${i + 1}. ${action}`).join("\n")
          : "暂无针对性整改建议。",
    },
  ];

  const caseNumber = buildCaseNumber(securityCase);

  return {
    title: securityCase.name,
    caseNumber,
    basicInfo: [
      { label: "案件编号", value: caseNumber },
      { label: "事件名称", value: securityCase.name },
      { label: "发现时间", value: formatDateTime(alert.occurredAt) },
      { label: "告警来源", value: alert.source },
      {
        label: "告警级别",
        value: alert.severity ? riskLevelLabels[alert.severity] : "（无数据）",
      },
      {
        label: "人工风险等级",
        value: humanReview?.humanRiskLevel
          ? riskLevelLabels[humanReview.humanRiskLevel]
          : "（未评定）",
      },
      { label: "研判人员", value: humanReview?.reviewer ?? "（未填写）" },
      { label: "报告生成时间", value: formatDateTime(generatedAt) },
    ],
    // 统一将正文中的 ISO 时间戳转为人类易读格式
    sections: sections.map((section) => ({
      ...section,
      content: normalizeDateTimesInText(section.content),
    })),
    evidenceIds: evidences
      .filter((e) => e.includedInReport)
      .map((e) => e.evidenceId),
    timelineEventIds: timeline.map((event) => event.id),
    generatedAt,
  };
}
