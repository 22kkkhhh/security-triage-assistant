import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/runtime/readiness", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/runtime/readiness")
  >("@/services/runtime/readiness");
  return {
    ...actual,
    checkApplicationReadiness: vi.fn(),
  };
});

import { GET as healthGET } from "@/app/api/health/route";
import { GET as readyGET } from "@/app/api/ready/route";
import { checkApplicationReadiness } from "@/services/runtime/readiness";

describe("GET /api/health", () => {
  it("returns 200 ok with no-store and no DB call", async () => {
    const readiness = vi.mocked(checkApplicationReadiness);
    readiness.mockClear();

    const response = await healthGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toMatch(/version|sha|database|secret|path/i);
    expect(readiness).not.toHaveBeenCalled();
  });
});

describe("GET /api/ready", () => {
  beforeEach(() => {
    vi.mocked(checkApplicationReadiness).mockReset();
  });

  it("returns 200 ready when probe passes", async () => {
    vi.mocked(checkApplicationReadiness).mockResolvedValue({ ready: true });

    const response = await readyGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ready" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 not_ready without leaking internals", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(checkApplicationReadiness).mockResolvedValue({
      ready: false,
      category: "schema_not_ready",
    });

    const response = await readyGET();
    const text = await response.text();
    const body = JSON.parse(text) as { status: string };

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "not_ready" });
    expect(text).not.toMatch(/P2022|SQL|assignedToUserId|prisma|file:/i);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
