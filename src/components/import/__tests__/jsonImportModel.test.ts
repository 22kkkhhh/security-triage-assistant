import { describe, expect, it } from "vitest";
import { JsonAlertParseError } from "@/services/intake/parseJsonAlert";
import {
  assertJsonAlertFileSize,
  JSON_ALERT_FILE_TOO_LARGE_MESSAGE,
  MAX_JSON_ALERT_FILE_BYTES,
  prepareJsonAlertImport,
  toJsonAlertImportErrorMessage,
} from "@/components/import/jsonImportModel";

describe("prepareJsonAlertImport", () => {
  it("canonical JSON → canonical pending pairs", () => {
    const pending = prepareJsonAlertImport(
      JSON.stringify({
        title: "Suspicious login",
        timestamp: "2026-08-08 02:36",
        src_ip: "10.0.0.8",
        user: "demo_user",
      }),
      "AUTH",
    );

    expect(pending.pairs).toEqual(
      expect.arrayContaining([
        { rawKey: "alertName", rawValue: "Suspicious login" },
        { rawKey: "alertTime", rawValue: "2026-08-08 02:36" },
        { rawKey: "sourceIp", rawValue: "10.0.0.8" },
        { rawKey: "username", rawValue: "demo_user" },
      ]),
    );
    expect(pending.pairs.some((p) => p.rawKey === "sourceIp")).toBe(true);
  });

  it("external_alert_id → pair rawKey = externalAlertId，rawValue 保持原值", () => {
    const pending = prepareJsonAlertImport(
      JSON.stringify({ external_alert_id: "A-001", title: "Test alert" }),
      "OTHER",
    );

    const idPair = pending.pairs.find((p) => p.rawKey === "externalAlertId");
    expect(idPair).toEqual({ rawKey: "externalAlertId", rawValue: "A-001" });
  });

  it("unknown dotted path → unrecognized，不进入 sourceIp", () => {
    const pending = prepareJsonAlertImport(
      JSON.stringify({
        title: "Nested vendor field",
        data: { srcip: "1.2.3.4" },
      }),
      "OTHER",
    );

    expect(pending.pairs.some((p) => p.rawKey === "sourceIp")).toBe(false);
    expect(
      pending.unrecognized.some(
        (u) => u.rawKey === "data.srcip" && u.rawValue === "1.2.3.4",
      ),
    ).toBe(true);
  });

  it("complex array parser warning → unrecognized 保留", () => {
    const pending = prepareJsonAlertImport(
      JSON.stringify({
        title: "Has complex array",
        events: [{ id: 1 }, { id: 2 }],
      }),
      "OTHER",
    );

    const warning = pending.unrecognized.find((u) => u.rawKey === "events");
    expect(warning).toBeTruthy();
    expect(warning?.reason).toContain("复杂数组");
  });

  it("malformed JSON → JsonAlertParseError 正确传播", () => {
    expect(() => prepareJsonAlertImport("{not json", "OTHER")).toThrow(
      JsonAlertParseError,
    );
    expect(() => prepareJsonAlertImport("{not json", "OTHER")).toThrow(
      /JSON 格式无效/,
    );
  });
});

describe("assertJsonAlertFileSize / error messages", () => {
  it("超过 1 MiB 抛出稳定文案", () => {
    expect(() => assertJsonAlertFileSize(MAX_JSON_ALERT_FILE_BYTES + 1)).toThrow(
      JSON_ALERT_FILE_TOO_LARGE_MESSAGE,
    );
    expect(() => assertJsonAlertFileSize(MAX_JSON_ALERT_FILE_BYTES)).not.toThrow();
  });

  it("toJsonAlertImportErrorMessage 保留 JsonAlertParseError.message", () => {
    expect(
      toJsonAlertImportErrorMessage(new JsonAlertParseError("JSON 格式无效，无法解析")),
    ).toBe("JSON 格式无效，无法解析");
    expect(toJsonAlertImportErrorMessage(new Error("boom"))).toBe(
      "JSON 文件读取或解析失败，请检查文件后重试。",
    );
  });
});
