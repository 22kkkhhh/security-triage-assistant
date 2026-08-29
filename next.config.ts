import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
] as const;

const nextConfig: NextConfig = {
  // 禁止 Next 自动改写仓库根目录 AGENTS.md（本项目有独立产品约束文件）
  agentRules: false,
  allowedDevOrigins: ["43.139.70.88"],
  turbopack: {
    root: import.meta.dirname,
  },
  /**
   * Minimum web security baseline (v1.12-M1).
   * CSP deferred — Next App Router needs careful nonce/hash evidence.
   * HSTS deferred to reverse-proxy TLS termination (avoid localhost/HTTP breakage).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
