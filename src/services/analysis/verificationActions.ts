/**
 * Security Rule verification action 的稳定 machine identity。
 * id = stable machine identity；label = presentation text。
 */
export interface VerificationAction {
  id: string;
  label: string;
}

export function verificationAction(
  id: string,
  label: string,
): VerificationAction {
  return { id, label };
}

/** 跨规则复用的语义化 actionId（完整 identity = ruleId + actionId） */
export const VA = {
  verifyPlannedTask: verificationAction(
    "verify-planned-task",
    "核查计划任务",
  ),
  verifyChangeTicket: verificationAction(
    "verify-change-ticket",
    "查询变更工单",
  ),
  contactBusinessOwner: verificationAction(
    "contact-business-owner",
    "联系业务负责人",
  ),
  fetchEgressNetworkLog: verificationAction(
    "fetch-egress-network-log",
    "获取对应时间段防火墙/出口网络日志及流量统计信息",
  ),
  confirmDataExportDestination: verificationAction(
    "confirm-data-export-destination",
    "确认数据是否被导出及去向",
  ),
  supplementDbAuditLog: verificationAction(
    "supplement-db-audit-log",
    "补充对应时间段的数据库审计日志（含返回行数与涉及字段）",
  ),
  supplementAccessBaseline: verificationAction(
    "supplement-access-baseline",
    "补充该账号及来源地址的历史访问基线数据后重新评估",
  ),
  verifyOffHoursPlannedTask: verificationAction(
    "verify-off-hours-planned-task",
    "核查是否存在夜间计划任务或值班操作安排",
  ),
  supplementBusinessHoursAudit: verificationAction(
    "supplement-business-hours-audit",
    "确认企业工作时间口径，并补充审计日志时间戳",
  ),
  verifySourceIpOwnership: verificationAction(
    "verify-source-ip-ownership",
    "核实源 IP 资产归属",
  ),
  confirmAccountUser: verificationAction(
    "confirm-account-user",
    "确认账号实际使用人",
  ),
  supplementLoginSourceHistory: verificationAction(
    "supplement-login-source-history",
    "补充该账号历史登录来源清单后重新评估",
  ),
  contactAccountUser: verificationAction(
    "contact-account-user",
    "联系账号使用人确认是否本人操作",
  ),
  verifyFailedAuthSourceDistribution: verificationAction(
    "verify-failed-auth-source-distribution",
    "核查失败认证的来源地址分布",
  ),
  supplementAuthLogFailureCount: verificationAction(
    "supplement-auth-log-failure-count",
    "补充统一认证系统日志（含失败次数与时间分布）",
  ),
  verifyCrossSystemAccessLogs: verificationAction(
    "verify-cross-system-access-logs",
    "核对各系统访问日志与业务操作记录",
  ),
  supplementBusinessSystemAccessLogs: verificationAction(
    "supplement-business-system-access-logs",
    "补充各业务系统的访问日志",
  ),
  verifyExternalCommunicationContent: verificationAction(
    "verify-external-communication-content",
    "核查通信对端地址归属与通信内容",
  ),
  verifyOutboundTrafficDetails: verificationAction(
    "verify-outbound-traffic-details",
    "核查出站流量的目的地、协议与会话内容",
  ),
  verifyOperationInitiator: verificationAction(
    "verify-operation-initiator",
    "核实操作发起人身份",
  ),
  assessSecurityIncidentEscalation: verificationAction(
    "assess-security-incident-escalation",
    "评估是否需要升级安全事件",
  ),
  recordUnauthorizedOperation: verificationAction(
    "record-unauthorized-operation",
    "记录未授权操作细节",
  ),
  assessImpactAndStartRemediation: verificationAction(
    "assess-impact-and-start-remediation",
    "评估影响范围并启动处置流程",
  ),
} as const;

export const EMPTY_VERIFICATION_ACTIONS: VerificationAction[] = [];
