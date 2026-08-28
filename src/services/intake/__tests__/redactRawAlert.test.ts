import { describe, expect, it } from "vitest";
import { redactRawAlert } from "../redactRawAlert";

describe("redactRawAlert", () => {
  it("redacts credentials at every nesting level while preserving other fields", () => {
    const result = redactRawAlert({
      id: "a-1",
      password: "never-store",
      data: { authorization: "Bearer secret", username: "alice" },
      items: [{ apiKey: "key", value: 3 }],
    });
    expect(result.redactionCount).toBe(3);
    expect(result.payload).toEqual({
      id: "a-1",
      password: "[REDACTED]",
      data: { authorization: "[REDACTED]", username: "alice" },
      items: [{ apiKey: "[REDACTED]", value: 3 }],
    });
  });
});
