import { describe, expect, it } from "vitest";
import {
  type E2EHarnessEnv,
  shouldForceComplianceResolutionUnavailable,
} from "../e2eHarness";

/**
 * shouldForceComplianceResolutionUnavailable 必须只在极窄的、代码强制的组合下
 * 返回 true；production 场景必须代码级 impossible（不依赖运维约定）。
 * 全部测试显式传入 env object，不污染真实 process.env。
 */

const E2E_DB_URL = "file:./prisma/e2e.db";
const DEV_DB_URL = "file:./prisma/dev.db";

const fullyEnabledEnv: E2EHarnessEnv = {
  NODE_ENV: "development",
  E2E_HARNESS: "1",
  E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE: "1",
  DATABASE_URL: E2E_DB_URL,
};

describe("shouldForceComplianceResolutionUnavailable", () => {
  it("development + harness + force + 精确 e2e.db → true", () => {
    expect(shouldForceComplianceResolutionUnavailable(fullyEnabledEnv)).toBe(
      true,
    );
  });

  it("production + 全部 flag → false（代码强制，不依赖运维约定）", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });

  it("development + harness 缺失 → false", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        E2E_HARNESS: undefined,
      }),
    ).toBe(false);
  });

  it("development + force 缺失 → false", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE: undefined,
      }),
    ).toBe(false);
  });

  it("development + dev.db → false（不接受 dev.db，即使其余 flag 全部为真）", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        DATABASE_URL: DEV_DB_URL,
      }),
    ).toBe(false);
  });

  it("development + 其它 SQLite DB → false（不做模糊匹配 / 任意 SQLite 文件放行）", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        DATABASE_URL: "file:./prisma/e2e-other.db",
      }),
    ).toBe(false);
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        DATABASE_URL: "file:./some/other/e2e.db",
      }),
    ).toBe(false);
  });

  it("test + 全部 flag → false（只有 development 才允许）", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        NODE_ENV: "test",
      }),
    ).toBe(false);
  });

  it("staging + 全部 flag → false", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        NODE_ENV: "staging",
      }),
    ).toBe(false);
  });

  it("NODE_ENV undefined + 全部其余 flag → false", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        NODE_ENV: undefined,
      }),
    ).toBe(false);
  });

  it("E2E_HARNESS 值不为 \"1\"（如 \"true\"）→ false", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        E2E_HARNESS: "true",
      }),
    ).toBe(false);
  });

  it("E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE 值不为 \"1\"（如 \"true\"）→ false", () => {
    expect(
      shouldForceComplianceResolutionUnavailable({
        ...fullyEnabledEnv,
        E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE: "true",
      }),
    ).toBe(false);
  });

  it("生产真实 env 组合（生产误配全部 4 个变量）仍必须为 false", () => {
    // 显式覆盖真实 process.env 的 4 个字段来断言，不依赖 process.env 当前值，
    // 也不修改 process.env 本身。
    const prodMisconfigured: E2EHarnessEnv = {
      NODE_ENV: "production",
      E2E_HARNESS: "1",
      E2E_FORCE_COMPLIANCE_RESOLUTION_UNAVAILABLE: "1",
      DATABASE_URL: E2E_DB_URL,
    };
    expect(
      shouldForceComplianceResolutionUnavailable(prodMisconfigured),
    ).toBe(false);
  });

  it("默认参数读取 process.env；真实开发环境 process.env 下必须为 false（无 E2E flag）", () => {
    expect(shouldForceComplianceResolutionUnavailable()).toBe(false);
  });
});
