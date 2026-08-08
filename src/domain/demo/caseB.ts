import type { SecurityCaseDraft } from "../types";

/**
 * Case B：疑似账号失陷导致异常数据访问。
 * 全部为虚构 Mock 数据：公网地址使用文档示例段 203.0.113.0/24，
 * 内网地址为 RFC1918 地址，账号与人物均为虚构。
 * 注意：人工结论必须使用“疑似 / 建议进一步核查”等措辞，不得写成“确认遭到黑客攻击”。
 * 分析结果、证据与核查清单由规则引擎生成，此处只提供原始上下文。
 */
export const caseB: SecurityCaseDraft = {
  id: "demo-case-b",
  name: "Case B：疑似账号失陷引发异常数据访问",
  createdAt: "2026-08-08T08:50:00+08:00",
  alert: {
    title: "账号异常登录与敏感数据访问告警",
    source: "统一认证系统 / 数据库审计系统（演示）",
    severity: "HIGH",
    occurredAt: "2026-08-08T01:58:00+08:00",
    description:
      "账号在连续失败认证后，由此前未出现过的内网测试地址登录成功，随后跨多个业务系统访问并批量查询敏感数据，同时出现异常公网通信。",
    originalAlertId: "DEMO-AUTH-20260808-0158",
  },
  dataContext: {
    accessStatus: "ABNORMAL",
    databaseName: "CRM_PROD",
    tableName: "customer_info",
    accessedRecordCount: 182391,
    sensitiveFieldTypes: ["姓名", "手机号", "身份证号", "地址"],
    operationType: "SELECT",
    outsideBusinessHours: "ABNORMAL",
    baseline: {
      averageRecordCount: 14820,
      maxRecordCount: 30000,
      observationDays: 7,
    },
    note: "凌晨批量查询约 182,391 条敏感记录，明显超出该账号历史基线。",
  },
  networkContext: {
    networkStatus: "ABNORMAL",
    internalSourceIp: "172.16.8.23",
    externalCommunication: "ABNORMAL",
    externalDestination: "203.0.113.42:443",
    outboundTransferBytes: 1_258_291_200,
    note: "02:41 检测到向 203.0.113.42 的持续公网通信，出站流量约 1.2GB，暂无法排除数据外传风险。",
  },
  identityContext: {
    identityStatus: "ABNORMAL",
    accountName: "demo_user_07",
    failedLoginAttempts: 16,
    loginFromUnseenSource: "ABNORMAL",
    loginSourceIp: "172.16.8.23",
    accessedSystems: ["HR 系统", "ERP 系统", "CRM_PROD"],
    note: "连续 16 次失败认证后，由此前未出现过的内网测试地址登录成功，疑似账号凭据泄露。",
  },
  businessContext: {
    plannedTaskStatus: "NOT_FOUND",
    changeTicketStatus: "NOT_FOUND",
    changeTicketId: null,
    businessOwner: null,
    ownerVerification: "UNKNOWN",
    businessLegitimacy: "UNKNOWN",
    businessJustification: null,
  },
  timeline: [
    {
      id: "b-tl-01",
      occurredAt: "2026-08-08T01:58:00+08:00",
      eventType: "认证",
      title: "连续失败认证",
      description: "账号 demo_user_07 连续失败登录 16 次。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "b-tl-02",
      occurredAt: "2026-08-08T02:01:00+08:00",
      eventType: "认证",
      title: "陌生来源登录成功",
      description: "由此前未出现过的 172.16.8.23（内网测试地址）登录成功。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "b-tl-03",
      occurredAt: "2026-08-08T02:10:00+08:00",
      eventType: "系统访问",
      title: "访问 HR 系统",
      description: "该账号历史未访问过 HR 系统。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "b-tl-04",
      occurredAt: "2026-08-08T02:15:00+08:00",
      eventType: "系统访问",
      title: "访问 ERP 系统",
      description: "该账号历史未访问过 ERP 系统。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "b-tl-05",
      occurredAt: "2026-08-08T02:36:00+08:00",
      eventType: "数据访问",
      title: "批量查询敏感数据",
      description: "查询 CRM_PROD.customer_info 约 182,391 条敏感记录。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "b-tl-06",
      occurredAt: "2026-08-08T02:41:00+08:00",
      eventType: "网络通信",
      title: "异常公网通信",
      description: "检测到向 203.0.113.42 的持续公网通信。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "b-tl-07",
      occurredAt: "2026-08-08T09:20:00+08:00",
      eventType: "人工处置",
      title: "人工核查",
      description: "研判人员联系账号使用人，反馈当日未进行任何登录操作。",
      operator: "王研判",
      source: "HUMAN",
    },
  ],
  humanReview: {
    reviewer: "王研判",
    finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
    humanRiskLevel: "HIGH",
    conclusionNote:
      "当前证据显示疑似账号失陷并伴随异常数据访问，存在数据泄露风险，建议升级为安全事件并进一步核查公网通信内容。该结论为人工研判意见，待补充证据后复核。",
    adjustments: [],
    confirmedAt: "2026-08-08T09:45:00+08:00",
  },
  report: null,
};
