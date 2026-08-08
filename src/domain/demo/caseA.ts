import type { SecurityCaseDraft } from "../types";

/**
 * Case A：技术表现异常，但经业务上下文核实属于正常授权业务。
 * 全部为虚构 Mock 数据：内网地址为 RFC1918 地址，人物为虚构姓名。
 * 分析结果、证据与核查清单由规则引擎生成，此处只提供原始上下文。
 */
export const caseA: SecurityCaseDraft = {
  id: "demo-case-a",
  name: "Case A：夜间大批量敏感数据查询（授权迁移）",
  createdAt: "2026-08-08T09:30:00+08:00",
  alert: {
    title: "夜间大批量敏感数据查询告警",
    source: "数据库审计系统（演示）",
    severity: "HIGH",
    occurredAt: "2026-08-08T01:30:00+08:00",
    description:
      "CRM_PROD.customer_info 在凌晨被批量查询约 182,391 条记录，涉及姓名、手机号、身份证号、地址等敏感字段。",
    originalAlertId: "DEMO-DB-20260808-0130",
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
      averageRecordCount: 12000,
      maxRecordCount: 25000,
      observationDays: 7,
    },
    note: "查询发生在凌晨非工作时间，且量级明显超出日常业务基线。",
  },
  networkContext: {
    networkStatus: "UNKNOWN",
    internalSourceIp: "10.20.3.15",
    externalCommunication: "UNKNOWN",
    externalDestination: null,
    outboundTransferBytes: null,
    note: "来源为内网 ETL 服务器；本案件未导入出口网络日志与流量统计，无法判断是否存在异常公网通信。",
  },
  identityContext: {
    identityStatus: "NORMAL",
    accountName: "etl_svc_demo01",
    failedLoginAttempts: 0,
    loginFromUnseenSource: "NORMAL",
    loginSourceIp: "10.20.3.15",
    accessedSystems: ["CRM_PROD"],
    note: "使用固定 ETL 服务账号，来源地址与历史一致。",
  },
  businessContext: {
    plannedTaskStatus: "CONFIRMED",
    changeTicketStatus: "CONFIRMED",
    changeTicketId: "CHG-20260808-003",
    businessOwner: "李演示",
    ownerVerification: "CONFIRMED",
    businessLegitimacy: "AUTHORIZED",
    businessJustification:
      "经核实，本次查询属于已批准的 CRM 数据迁移计划任务，工单 CHG-20260808-003，业务负责人已确认为授权行为。",
  },
  timeline: [
    {
      id: "a-tl-01",
      occurredAt: "2026-08-08T01:30:00+08:00",
      eventType: "告警",
      title: "数据库审计告警触发",
      description: "CRM_PROD.customer_info 被批量查询约 182,391 条记录。",
      operator: null,
      source: "SYSTEM",
    },
    {
      id: "a-tl-02",
      occurredAt: "2026-08-08T09:40:00+08:00",
      eventType: "人工处置",
      title: "开始人工核查",
      description: "研判人员核查业务上下文，检索到变更工单 CHG-20260808-003。",
      operator: "王研判",
      source: "HUMAN",
    },
    {
      id: "a-tl-03",
      occurredAt: "2026-08-08T10:10:00+08:00",
      eventType: "人工处置",
      title: "业务负责人确认",
      description: "李演示确认本次查询属于授权数据迁移。",
      operator: "王研判",
      source: "HUMAN",
    },
  ],
  humanReview: {
    reviewer: "王研判",
    finalConclusion: "NORMAL_BUSINESS",
    humanRiskLevel: "LOW",
    conclusionNote:
      "技术层面查询行为异常，但存在正式变更工单且业务负责人已确认，人工结论：正常授权业务行为。",
    adjustments: ["DATA-001 的异常由业务上下文合法化，不升级为安全事件"],
    confirmedAt: "2026-08-08T10:20:00+08:00",
  },
  report: null,
};
