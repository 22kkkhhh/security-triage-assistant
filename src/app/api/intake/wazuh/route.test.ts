import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validSignature } from "./route";

describe("Wazuh webhook signature", () => {
  it("accepts the signed timestamp/body and rejects tampering or replay", () => {
    const now = 1_756_370_000_000;
    const timestamp = String(Math.floor(now / 1000));
    const body = JSON.stringify({ id: "a-1" });
    const signature = createHmac("sha256", "test-secret").update(`${timestamp}.${body}`).digest("hex");
    expect(validSignature(`sha256=${signature}`, timestamp, body, "test-secret", now)).toBe(true);
    expect(validSignature(signature, timestamp, `${body}x`, "test-secret", now)).toBe(false);
    expect(validSignature(signature, String(Number(timestamp) - 301), body, "test-secret", now)).toBe(false);
  });
});
