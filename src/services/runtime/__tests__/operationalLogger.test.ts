import { describe, expect, it } from "vitest";
import { logOperationalEvent } from "@/services/runtime/operationalLogger";

describe("operationalLogger", () => {
  it("emits one-line JSON with allowlisted fields", () => {
    const lines: string[] = [];
    logOperationalEvent(
      {
        level: "info",
        event: "migration_success",
        component: "production_start",
        status: "ok",
        stage: "migrate",
      },
      {
        clock: () => new Date("2026-08-11T08:00:00.000Z"),
        sink: (line) => lines.push(line),
      },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/[\r\n]/);
    expect(JSON.parse(lines[0]!)).toEqual({
      timestamp: "2026-08-11T08:00:00.000Z",
      level: "info",
      event: "migration_success",
      component: "production_start",
      status: "ok",
      stage: "migrate",
    });
  });

  it("supports authz_denied allowlisted fields only", () => {
    const lines: string[] = [];
    logOperationalEvent(
      {
        level: "warn",
        event: "authz_denied",
        component: "authz",
        status: "denied",
        permission: "CASE_ASSIGN",
        role: "VIEWER",
      },
      {
        clock: () => new Date("2026-08-11T08:00:00.000Z"),
        sink: (line) => lines.push(line),
      },
    );
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "component",
        "event",
        "level",
        "permission",
        "role",
        "status",
        "timestamp",
      ].sort(),
    );
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("metadata");
    expect(parsed).not.toHaveProperty("DATABASE_URL");
  });
});
