import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeWazuhAlert } from "@/services/intake/wazuhAlertAdapter";

function samplePath(name: string): string {
  return resolve(process.cwd(), "samples", "public", name);
}

describe("公开样本文件只读解析", () => {
  it("parses the Wazuh/Suricata JSONL sample", () => {
    const line = readFileSync(samplePath("wazuh-suricata-alert.jsonl"), "utf8").trim();
    const result = normalizeWazuhAlert(line);

    expect(result.input.externalAlertId).toBe("suricata-demo-20230502-001");
    expect(result.input.sourceIp).toBe("16.10.10.10");
    expect(result.input.destinationIp).toBe("16.10.10.11");
    expect(result.input.destinationPort).toBe(80);
    expect(result.input.protocol).toBe("TCP");
  });

  it("parses the Wazuh/Office365 JSONL sample", () => {
    const line = readFileSync(samplePath("wazuh-office365-user-event.jsonl"), "utf8").trim();
    const result = normalizeWazuhAlert(line);

    expect(result.input.externalAlertId).toBe("office365-demo-20240129-001");
    expect(result.input.username).toBe("demo.user@example.test");
    expect(result.input.operation).toBe("Add user");
  });

  it("keeps pgAudit text as a reference fixture, not an unsupported JSON import", () => {
    const text = readFileSync(samplePath("pgaudit-session.log"), "utf8").trim();
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("AUDIT: SESSION");
    expect(text).toContain("READ,SELECT");
  });
});
