import { describe, expect, it } from "vitest";
import type { AuthUser } from "@/domain/auth";
import {
  buildAppShellCapabilities,
  buildCaseWorkbenchCapabilities,
  buildNavigationCapabilities,
  buildReportPageCapabilities,
  isCaseWorkbenchReadOnly,
} from "@/domain/uiCapabilities";

function user(role: AuthUser["role"], enabled = true): AuthUser {
  return {
    id: `id-${role}`,
    username: role.toLowerCase(),
    displayName: role,
    email: `${role.toLowerCase()}@example.test`,
    role,
    enabled,
  };
}

describe("UI capabilities from Permission SoT", () => {
  it("VIEWER：case read 场景下全部 case write false；report write/export false", () => {
    const caseCaps = buildCaseWorkbenchCapabilities(user("VIEWER"));
    expect(caseCaps).toEqual({
      canSnapshotWrite: false,
      canChangeStatus: false,
      canAssignCase: false,
      canWriteDueDate: false,
      canWriteChecklist: false,
      canWriteBusinessContext: false,
      canWriteHumanReview: false,
      canWriteTimeline: false,
      canWriteHandoff: false,
      canWriteReport: false,
      canExportReport: false,
    });
    expect(isCaseWorkbenchReadOnly(caseCaps)).toBe(true);
    expect(buildReportPageCapabilities(user("VIEWER"))).toEqual({
      canWrite: false,
      canExport: false,
    });
    expect(buildNavigationCapabilities(user("VIEWER")).canCreateCase).toBe(
      false,
    );
    expect(buildAppShellCapabilities(user("VIEWER")).showReadOnlyHint).toBe(
      true,
    );
  });

  it("ANALYST：case/report write 与 export true；可新建", () => {
    const caseCaps = buildCaseWorkbenchCapabilities(user("ANALYST"));
    expect(caseCaps.canSnapshotWrite).toBe(true);
    expect(caseCaps.canChangeStatus).toBe(true);
    expect(caseCaps.canAssignCase).toBe(true);
    expect(caseCaps.canWriteDueDate).toBe(true);
    expect(caseCaps.canWriteChecklist).toBe(true);
    expect(caseCaps.canWriteBusinessContext).toBe(true);
    expect(caseCaps.canWriteHumanReview).toBe(true);
    expect(caseCaps.canWriteTimeline).toBe(true);
    expect(caseCaps.canWriteHandoff).toBe(true);
    expect(caseCaps.canWriteReport).toBe(true);
    expect(caseCaps.canExportReport).toBe(true);
    expect(isCaseWorkbenchReadOnly(caseCaps)).toBe(false);
    expect(buildReportPageCapabilities(user("ANALYST"))).toEqual({
      canWrite: true,
      canExport: true,
    });
    expect(buildNavigationCapabilities(user("ANALYST")).canCreateCase).toBe(
      true,
    );
    expect(buildAppShellCapabilities(user("ANALYST")).showReadOnlyHint).toBe(
      false,
    );
  });

  it("ADMIN：Case/Report 操作能力与 ANALYST 相同（无独立 Ops 控件）", () => {
    expect(buildCaseWorkbenchCapabilities(user("ADMIN"))).toEqual(
      buildCaseWorkbenchCapabilities(user("ANALYST")),
    );
    expect(buildReportPageCapabilities(user("ADMIN"))).toEqual(
      buildReportPageCapabilities(user("ANALYST")),
    );
    expect(buildNavigationCapabilities(user("ADMIN")).canCreateCase).toBe(true);
  });

  it("disabled user：全部 capability false", () => {
    const caseCaps = buildCaseWorkbenchCapabilities(user("ADMIN", false));
    expect(Object.values(caseCaps).every((v) => v === false)).toBe(true);
    expect(buildReportPageCapabilities(user("ANALYST", false))).toEqual({
      canWrite: false,
      canExport: false,
    });
    expect(buildNavigationCapabilities(user("VIEWER", false)).canCreateCase).toBe(
      false,
    );
  });
});
