/**
 * Better Auth 1.6.26 runtime hardening helpers (typed against installed package).
 *
 * Cookie attributes (httpOnly / sameSite=lax / secure-from-https-baseURL) are
 * already applied by better-auth/dist/cookies/index.mjs — this module does not
 * monkey-patch cookies.
 *
 * Rate limit: native BetterAuthRateLimitOptions; production-enabled by library
 * default; /sign-in special rule is 3 req / 10s in better-auth rate-limiter.
 *
 * IP trust: do not consume untrusted X-Forwarded-For unless operators configure
 * trustedProxies. Empty ipAddressHeaders → null IP in production → shared
 * per-path memory bucket (single-node safe).
 */

import type { BetterAuthOptions } from "better-auth";

type RateLimitOptions = NonNullable<BetterAuthOptions["rateLimit"]>;
type AdvancedOptions = NonNullable<BetterAuthOptions["advanced"]>;

/**
 * Explicit rate-limit posture for Security Triage Assistant.
 * `enabled` omitted → library default (on in production, off otherwise).
 */
export function buildBetterAuthRateLimitOptions(): RateLimitOptions {
  return {
    storage: "memory",
    // Keep BA defaults for window/max; /sign-in|/sign-up special rules apply
    // (window 10, max 3) from better-auth/dist/api/rate-limiter/index.mjs.
  };
}

/**
 * Refuse forged client IP headers until reverse-proxy trust is configured.
 */
export function buildBetterAuthIpAddressOptions(): NonNullable<
  AdvancedOptions["ipAddress"]
> {
  return {
    ipAddressHeaders: [],
  };
}

export function buildBetterAuthAdvancedOptions(): AdvancedOptions {
  return {
    ipAddress: buildBetterAuthIpAddressOptions(),
  };
}
