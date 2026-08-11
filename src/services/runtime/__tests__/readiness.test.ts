import { describe, expect, it, vi } from "vitest";
import {
  checkApplicationReadiness,
  formatReadinessFailureMessage,
} from "@/services/runtime/readiness";

describe("checkApplicationReadiness", () => {
  it("returns ready when probe query succeeds", async () => {
    const client = {
      caseRecord: {
        findFirst: vi.fn(async () => ({
          id: "c1",
          assignedToUserId: null,
          dueAt: null,
        })),
      },
    };

    await expect(checkApplicationReadiness(client)).resolves.toEqual({
      ready: true,
    });
    expect(client.caseRecord.findFirst).toHaveBeenCalledWith({
      select: { id: true, assignedToUserId: true, dueAt: true },
    });
  });

  it("maps P2022 to schema_not_ready without leaking message", async () => {
    const client = {
      caseRecord: {
        findFirst: vi.fn(async () => {
          const error = new Error(
            "The column main.CaseRecord.assignedToUserId does not exist in C:\\data\\prod.db",
          );
          (error as { code?: string }).code = "P2022";
          throw error;
        }),
      },
    };

    const result = await checkApplicationReadiness(client);
    expect(result).toEqual({ ready: false, category: "schema_not_ready" });
    expect(formatReadinessFailureMessage("schema_not_ready")).not.toMatch(
      /assignedToUserId|P2022|prod\.db|C:\\/,
    );
  });

  it("maps connection-style failures to database_unavailable", async () => {
    const client = {
      caseRecord: {
        findFirst: vi.fn(async () => {
          const error = new Error("Unable to open the database file");
          (error as { code?: string }).code = "P1001";
          throw error;
        }),
      },
    };

    await expect(checkApplicationReadiness(client)).resolves.toEqual({
      ready: false,
      category: "database_unavailable",
    });
  });
});
