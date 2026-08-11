import { describe, expect, it } from "vitest";
import {
  buildBetterAuthAdvancedOptions,
  buildBetterAuthIpAddressOptions,
  buildBetterAuthRateLimitOptions,
} from "@/lib/authRuntimeConfig";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("Better Auth runtime hardening config", () => {
  it("uses memory rate-limit storage (single-node)", () => {
    expect(buildBetterAuthRateLimitOptions()).toEqual({ storage: "memory" });
  });

  it("does not trust X-Forwarded-For by default", () => {
    expect(buildBetterAuthIpAddressOptions()).toEqual({
      ipAddressHeaders: [],
    });
    expect(buildBetterAuthAdvancedOptions().ipAddress).toEqual({
      ipAddressHeaders: [],
    });
  });

  it("auth.ts wires rateLimit + advanced without rewriting cookie attrs", () => {
    const authSource = readFileSync(
      path.join(repoRoot, "src/lib/auth.ts"),
      "utf8",
    );
    expect(authSource).toContain("rateLimit: buildBetterAuthRateLimitOptions()");
    expect(authSource).toContain(
      "advanced: buildBetterAuthAdvancedOptions()",
    );
    expect(authSource).not.toMatch(/defaultCookieAttributes|useSecureCookies/);
    expect(authSource).toContain("disableSignUp: true");
    expect(authSource).toContain('disabledPaths: ["/is-username-available"]');
  });

  it("documents BA native /sign-in special rule remains in installed package", () => {
    const limiter = readFileSync(
      path.join(
        repoRoot,
        "node_modules/better-auth/dist/api/rate-limiter/index.mjs",
      ),
      "utf8",
    );
    expect(limiter).toContain('path.startsWith("/sign-in")');
    expect(limiter).toMatch(/window:\s*10/);
    expect(limiter).toMatch(/max:\s*3/);
  });
});
