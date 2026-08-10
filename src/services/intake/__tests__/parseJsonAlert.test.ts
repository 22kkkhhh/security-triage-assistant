import { describe, expect, it } from "vitest";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import { matchFieldByHeader } from "@/services/normalization/fields";
import { normalizeRecord } from "@/services/normalization/normalize";
import {
  JsonAlertParseError,
  normalizeJsonAlert,
  parseJsonAlert,
} from "@/services/intake/parseJsonAlert";

const MAX_DEPTH_FIXTURE = 12;
const MAX_FIELD_COUNT = 200;

describe("externalAlertId field aliases", () => {
  it("语义明确的 alias 可映射到 externalAlertId", () => {
    expect(matchFieldByHeader("external_alert_id")?.key).toBe("externalAlertId");
    expect(matchFieldByHeader("alert_id")?.key).toBe("externalAlertId");
    expect(matchFieldByHeader("event_id")?.key).toBe("externalAlertId");
  });

  it("泛化 alias id/uuid/key 不会映射到 externalAlertId", () => {
    expect(matchFieldByHeader("id")).toBeNull();
    expect(matchFieldByHeader("uuid")).toBeNull();
    expect(matchFieldByHeader("key")).toBeNull();
  });
});

describe("parseJsonAlert", () => {
  it("canonical flat JSON 生成可 normalize 的 pairs", () => {
    const json = JSON.stringify({
      title: "Suspicious login",
      timestamp: "2026-08-08 02:36",
      src_ip: "10.0.0.8",
      user: "demo_user",
    });
    const result = normalizeJsonAlert(json, "AUTH");
    expect(result.input.alertName).toBe("Suspicious login");
    expect(result.input.alertTime).toBe("2026-08-08 02:36");
    expect(result.input.sourceIp).toBe("10.0.0.8");
    expect(result.input.username).toBe("demo_user");
  });

  it("external_alert_id → NormalizedSecurityInput.externalAlertId", () => {
    const json = JSON.stringify({ external_alert_id: "A-001", title: "Test alert" });
    const result = normalizeJsonAlert(json, "OTHER");
    expect(result.input.externalAlertId).toBe("A-001");
  });

  it("externalAlertId → buildSecurityCaseDraft.alert.originalAlertId", () => {
    const json = JSON.stringify({ alert_id: "EVT-7788", title: "Export test" });
    const { input } = normalizeJsonAlert(json, "FIREWALL");
    const draft = buildSecurityCaseDraft(input, "intake-test-1");
    expect(draft.alert.originalAlertId).toBe("EVT-7788");
  });

  it("missing externalAlertId 保持 null", () => {
    const json = JSON.stringify({ title: "No external id" });
    const { input } = normalizeJsonAlert(json, "MANUAL");
    const draft = buildSecurityCaseDraft(input, "intake-test-2");
    expect(input.externalAlertId).toBeNull();
    expect(draft.alert.originalAlertId).toBeNull();
  });

  it("missing security context 保持 UNKNOWN / null / [] 而非 NORMAL", () => {
    const json = JSON.stringify({ title: "Sparse alert", src_ip: "10.1.1.1" });
    const { input } = normalizeJsonAlert(json, "OTHER");
    const draft = buildSecurityCaseDraft(input, "intake-test-3");
    expect(input.failedLoginAttempts).toBeNull();
    expect(input.externalCommunication).toBeNull();
    expect(input.accessedSystems).toEqual([]);
    expect(draft.dataContext.accessStatus).toBe("UNKNOWN");
    expect(draft.businessContext.changeTicketStatus).toBe("UNKNOWN");
    expect(draft.identityContext.loginFromUnseenSource).toBe("UNKNOWN");
    expect(draft.networkContext.externalCommunication).toBe("UNKNOWN");
    const analyzed = analyzeSecurityCase(draft);
    expect(analyzed.analysisResults.length).toBeGreaterThan(0);
  });

  it("malformed JSON 被拒绝", () => {
    expect(() => parseJsonAlert("{not json")).toThrow(JsonAlertParseError);
    expect(() => parseJsonAlert("{not json")).toThrow(/JSON 格式无效/);
  });

  it("root array 被拒绝", () => {
    expect(() => parseJsonAlert('[{"title":"x"}]')).toThrow(JsonAlertParseError);
    expect(() => parseJsonAlert('[{"title":"x"}]')).toThrow(/数组作为根节点/);
  });

  it("root primitive 被拒绝", () => {
    expect(() => parseJsonAlert('"hello"')).toThrow(JsonAlertParseError);
    expect(() => parseJsonAlert("42")).toThrow(JsonAlertParseError);
  });

  it("nested unknown field 使用 dotted path 且不会自动猜字段", () => {
    const json = JSON.stringify({
      title: "Nested",
      data: { srcip: "10.0.0.8", vendor_only: "keep-me" },
    });
    const { pairs } = parseJsonAlert(json);
    expect(pairs.some((p) => p.rawKey === "data.srcip" && p.rawValue === "10.0.0.8")).toBe(
      true,
    );
    expect(pairs.some((p) => p.rawKey === "data.vendor_only")).toBe(true);

    const normalized = normalizeRecord({ sourceType: "OTHER", pairs });
    expect(normalized.input.sourceIp).toBeNull();
    expect(
      normalized.unrecognized.some((item) => item.rawKey === "data.srcip"),
    ).toBe(true);
    expect(
      normalized.unrecognized.some((item) => item.rawKey === "data.vendor_only"),
    ).toBe(true);
  });

  it("primitive list 转为稳定 CSV 并可 normalize", () => {
    const json = JSON.stringify({
      title: "Systems",
      accessed_systems: ["CRM", "ERP"],
    });
    const result = normalizeJsonAlert(json, "DATABASE_AUDIT");
    expect(result.input.accessedSystems).toEqual(["CRM", "ERP"]);
  });

  it("null 字段不产生 pair，保持无数据语义", () => {
    const { pairs } = parseJsonAlert(
      JSON.stringify({ title: "Has null", external_alert_id: null }),
    );
    expect(pairs.some((p) => p.rawKey === "external_alert_id")).toBe(false);
  });

  it("过深 nesting 被拒绝", () => {
    let nested: Record<string, unknown> = { leaf: "x" };
    for (let i = 0; i < MAX_DEPTH_FIXTURE; i += 1) {
      nested = { level: nested };
    }
    expect(() => parseJsonAlert(JSON.stringify(nested))).toThrow(JsonAlertParseError);
  });

  it("超过 200 个普通字段被拒绝", () => {
    const obj: Record<string, string> = {};
    for (let i = 0; i <= MAX_FIELD_COUNT; i += 1) {
      obj[`field${i}`] = "value";
    }
    expect(() => parseJsonAlert(JSON.stringify(obj))).toThrow(JsonAlertParseError);
    expect(() => parseJsonAlert(JSON.stringify(obj))).toThrow(/字段数量过多/);
  });

  it("超过 200 个 null 字段被拒绝（null 不能绕过 field limit）", () => {
    const obj: Record<string, null> = {};
    for (let i = 0; i <= MAX_FIELD_COUNT; i += 1) {
      obj[`nullField${i}`] = null;
    }
    expect(() => parseJsonAlert(JSON.stringify(obj))).toThrow(JsonAlertParseError);
    expect(() => parseJsonAlert(JSON.stringify(obj))).toThrow(/字段数量过多/);
  });

  it("object array 不生成 mapped pair 且产生 unrecognized warning", () => {
    const json = JSON.stringify({
      title: "Object array",
      events: [{ id: 1, name: "evt" }],
    });
    const { pairs, unrecognized } = parseJsonAlert(json);
    expect(pairs.some((p) => p.rawKey === "events")).toBe(false);
    expect(
      unrecognized.some(
        (item) =>
          item.rawKey === "events" &&
          item.reason.includes("复杂数组暂不支持自动映射"),
      ),
    ).toBe(true);
  });

  it("mixed complex array 产生 warning", () => {
    const json = JSON.stringify({
      title: "Mixed array",
      mixed: [1, { nested: true }],
    });
    const { pairs, unrecognized } = parseJsonAlert(json);
    expect(pairs.some((p) => p.rawKey === "mixed")).toBe(false);
    expect(unrecognized.some((item) => item.rawKey === "mixed")).toBe(true);
  });

  it("normalizeJsonAlert 保留 parser warning 并与 normalize 未识别项合并", () => {
    const json = JSON.stringify({
      title: "Combined warnings",
      events: [{ id: 1 }],
      data: { vendor_only: "keep-me" },
    });
    const result = normalizeJsonAlert(json, "OTHER");
    expect(
      result.unrecognized.some(
        (item) =>
          item.rawKey === "events" &&
          item.reason.includes("复杂数组暂不支持自动映射"),
      ),
    ).toBe(true);
    expect(result.unrecognized.some((item) => item.rawKey === "data.vendor_only")).toBe(
      true,
    );
  });
});
