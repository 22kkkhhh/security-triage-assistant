import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("next.config security headers", () => {
  it("sets minimum baseline headers and defers CSP/HSTS", () => {
    const source = readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");
    expect(source).toContain("X-Content-Type-Options");
    expect(source).toContain("nosniff");
    expect(source).toContain("Referrer-Policy");
    expect(source).toContain("X-Frame-Options");
    expect(source).toContain("DENY");
    expect(source).toContain("Permissions-Policy");
    expect(source).not.toMatch(/Strict-Transport-Security|Content-Security-Policy/);
  });
});
