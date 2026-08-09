/**
 * UI Capability DTO（v1.3 Step 7）。
 *
 * 由 Server 根据 AuthUser + hasPermission() 派生，仅用于 UX 呈现。
 * 不是安全边界；写操作仍必须以 Server Authorization 为准。
 *
 * 禁止在此建立第二套 role → capability 映射表。
 */

import { hasPermission, type AuthUser } from "@/domain/auth";

/** 案件工作台写能力（不含只读能力；可读由页面 CASE_READ 门禁保证） */
export type CaseWorkbenchCapabilities = {
  canSnapshotWrite: boolean;
  canChangeStatus: boolean;
  canWriteChecklist: boolean;
  canWriteBusinessContext: boolean;
  canWriteHumanReview: boolean;
  canWriteTimeline: boolean;
  canWriteHandoff: boolean;
  canWriteReport: boolean;
  canExportReport: boolean;
};

export type ReportPageCapabilities = {
  canWrite: boolean;
  canExport: boolean;
};

export type NavigationCapabilities = {
  canCreateCase: boolean;
};

export type AppShellCapabilities = {
  navigation: NavigationCapabilities;
  /** 无案件/报告写权限时的轻量只读提示（非 role 硬编码） */
  showReadOnlyHint: boolean;
};

export function buildCaseWorkbenchCapabilities(
  user: AuthUser,
): CaseWorkbenchCapabilities {
  return {
    canSnapshotWrite: hasPermission(user, "CASE_SNAPSHOT_WRITE"),
    canChangeStatus: hasPermission(user, "CASE_STATUS_CHANGE"),
    canWriteChecklist: hasPermission(user, "CHECKLIST_WRITE"),
    canWriteBusinessContext: hasPermission(user, "BUSINESS_CONTEXT_WRITE"),
    canWriteHumanReview: hasPermission(user, "HUMAN_REVIEW_WRITE"),
    canWriteTimeline: hasPermission(user, "TIMELINE_WRITE"),
    canWriteHandoff: hasPermission(user, "HANDOFF_WRITE"),
    canWriteReport: hasPermission(user, "REPORT_WRITE"),
    canExportReport: hasPermission(user, "REPORT_EXPORT"),
  };
}

export function buildReportPageCapabilities(
  user: AuthUser,
): ReportPageCapabilities {
  return {
    canWrite: hasPermission(user, "REPORT_WRITE"),
    canExport: hasPermission(user, "REPORT_EXPORT"),
  };
}

export function buildNavigationCapabilities(
  user: AuthUser,
): NavigationCapabilities {
  return {
    canCreateCase: hasPermission(user, "CASE_CREATE"),
  };
}

export function buildAppShellCapabilities(user: AuthUser): AppShellCapabilities {
  const navigation = buildNavigationCapabilities(user);
  const caseCaps = buildCaseWorkbenchCapabilities(user);
  const reportCaps = buildReportPageCapabilities(user);
  const showReadOnlyHint =
    !navigation.canCreateCase &&
    !caseCaps.canSnapshotWrite &&
    !caseCaps.canChangeStatus &&
    !reportCaps.canWrite;
  return { navigation, showReadOnlyHint };
}

/** 工作台是否整体只读呈现（任一写能力为 true 则非只读模式横幅） */
export function isCaseWorkbenchReadOnly(
  caps: CaseWorkbenchCapabilities,
): boolean {
  return (
    !caps.canSnapshotWrite &&
    !caps.canChangeStatus &&
    !caps.canWriteChecklist &&
    !caps.canWriteBusinessContext &&
    !caps.canWriteHumanReview &&
    !caps.canWriteTimeline &&
    !caps.canWriteHandoff
  );
}
