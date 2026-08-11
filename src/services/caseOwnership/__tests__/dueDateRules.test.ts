import { describe, expect, it } from "vitest";
import { validateActorDueDateRule } from "@/services/caseOwnership/dueDateRules";

describe("dueDateRules", () => {
  const analyst = { id: "a1", role: "ANALYST" as const };
  const admin = { id: "admin1", role: "ADMIN" as const };
  const viewer = { id: "v1", role: "VIEWER" as const };

  it("Analyst own Case：PASS", () => {
    expect(
      validateActorDueDateRule({
        actor: analyst,
        currentAssignedToUserId: "a1",
      }),
    ).toEqual({ ok: true });
  });

  it("Analyst unassigned：reject", () => {
    const result = validateActorDueDateRule({
      actor: analyst,
      currentAssignedToUserId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });

  it("Analyst other's：reject", () => {
    const result = validateActorDueDateRule({
      actor: analyst,
      currentAssignedToUserId: "a2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });

  it("Admin any Case：PASS（含未分配）", () => {
    expect(
      validateActorDueDateRule({
        actor: admin,
        currentAssignedToUserId: null,
      }),
    ).toEqual({ ok: true });
    expect(
      validateActorDueDateRule({
        actor: admin,
        currentAssignedToUserId: "a2",
      }),
    ).toEqual({ ok: true });
  });

  it("Viewer：reject", () => {
    const result = validateActorDueDateRule({
      actor: viewer,
      currentAssignedToUserId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });
});
