import { describe, expect, it } from "vitest";
import {
  validateActorAssignmentRule,
  validateAssignmentTarget,
} from "@/services/caseOwnership/assignmentRules";

describe("assignmentRules — Analyst", () => {
  const analyst = { id: "a1", role: "ANALYST" as const };

  it("未分配 → 自己：success", () => {
    expect(
      validateActorAssignmentRule({
        actor: analyst,
        currentAssignedToUserId: null,
        targetUserId: "a1",
      }),
    ).toEqual({ ok: true });
  });

  it("自己 → 未分配：success", () => {
    expect(
      validateActorAssignmentRule({
        actor: analyst,
        currentAssignedToUserId: "a1",
        targetUserId: null,
      }),
    ).toEqual({ ok: true });
  });

  it("指派给他人：forbidden", () => {
    const result = validateActorAssignmentRule({
      actor: analyst,
      currentAssignedToUserId: null,
      targetUserId: "a2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });

  it("抢走他人案件：forbidden", () => {
    const result = validateActorAssignmentRule({
      actor: analyst,
      currentAssignedToUserId: "a2",
      targetUserId: "a1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });

  it("释放他人案件：forbidden", () => {
    const result = validateActorAssignmentRule({
      actor: analyst,
      currentAssignedToUserId: "a2",
      targetUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });
});

describe("assignmentRules — Admin", () => {
  it("Admin 可任意 eligible / 未分配", () => {
    expect(
      validateActorAssignmentRule({
        actor: { id: "admin", role: "ADMIN" },
        currentAssignedToUserId: "a1",
        targetUserId: "a2",
      }),
    ).toEqual({ ok: true });
    expect(
      validateActorAssignmentRule({
        actor: { id: "admin", role: "ADMIN" },
        currentAssignedToUserId: "a1",
        targetUserId: null,
      }),
    ).toEqual({ ok: true });
  });
});

describe("assignmentRules — target", () => {
  it("VIEWER reject", () => {
    const result = validateAssignmentTarget({
      targetUserId: "v1",
      targetUser: {
        id: "v1",
        role: "VIEWER",
        enabled: true,
        displayName: "V",
        username: "v",
      },
    });
    expect(result.ok).toBe(false);
  });

  it("disabled reject", () => {
    const result = validateAssignmentTarget({
      targetUserId: "a1",
      targetUser: {
        id: "a1",
        role: "ANALYST",
        enabled: false,
        displayName: "A",
        username: "a",
      },
    });
    expect(result.ok).toBe(false);
  });

  it("unknown reject", () => {
    const result = validateAssignmentTarget({
      targetUserId: "missing",
      targetUser: null,
    });
    expect(result.ok).toBe(false);
  });

  it("enabled ANALYST / ADMIN success；null unassign success", () => {
    expect(
      validateAssignmentTarget({
        targetUserId: "a1",
        targetUser: {
          id: "a1",
          role: "ANALYST",
          enabled: true,
          displayName: "A",
          username: "a",
        },
      }),
    ).toEqual({ ok: true });
    expect(
      validateAssignmentTarget({
        targetUserId: "admin",
        targetUser: {
          id: "admin",
          role: "ADMIN",
          enabled: true,
          displayName: "Ad",
          username: "ad",
        },
      }),
    ).toEqual({ ok: true });
    expect(
      validateAssignmentTarget({ targetUserId: null, targetUser: null }),
    ).toEqual({ ok: true });
  });
});
