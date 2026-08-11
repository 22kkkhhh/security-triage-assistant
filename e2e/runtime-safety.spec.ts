import { expect, test } from "@playwright/test";

/**
 * v1.12-M1：liveness / readiness 探针契约（无需登录）。
 * 不覆盖完整 production start gate（由单元测试 + 本地 smoke 覆盖）。
 */
test.describe("runtime safety probes", () => {
  test("GET /api/health → 200 ok no-store", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/no-store/i);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    const text = await response.text();
    expect(text).not.toMatch(/database|secret|sha|prisma/i);
  });

  test("GET /api/ready → 200 ready no-store", async ({ request }) => {
    const response = await request.get("/api/ready");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/no-store/i);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    const text = await response.text();
    expect(text).not.toMatch(/P2022|SQL|assignedToUserId|file:/i);
  });
});
