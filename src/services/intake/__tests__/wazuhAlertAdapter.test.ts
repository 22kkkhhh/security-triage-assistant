import { describe, expect, it } from "vitest";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import { matchFieldByHeader } from "@/services/normalization/fields";
import { normalizeJsonAlert } from "@/services/intake/parseJsonAlert";
import { normalizeWazuhAlert } from "@/services/intake/wazuhAlertAdapter";
import { mapWazuhRuleLevelToRiskLevel } from "@/services/intake/wazuhSeverityPolicy";

const CANONICAL_WAZUH = {
  id: "wazuh-demo-1712345678.123456",
  timestamp: "2026-08-10T03:15:22.000Z",
  rule: {
    id: "5710",
    level: 10,
    description: "sshd: authentication failed from untrusted source",
  },
  agent: {
    id: "003",
    name: "demo-edge-01",
  },
  manager: { name: "demo-wazuh-manager" },
  decoder: { name: "sshd" },
  location: "/var/log/auth.log",
  full_log:
    "Aug 10 03:15:22 demo-edge-01 sshd[4242]: Failed password for demo_ops from 198.51.100.24 port 51234 ssh2",
  data: {
    srcip: "198.51.100.24",
    srcuser: "demo_ops",
    dstuser: "root",
    dstip: "10.0.0.21",
    dstport: "22",
    protocol: "tcp",
    events: [{ nested: true }, { nested: true }],
  },
};

describe("mapWazuhRuleLevelToRiskLevel", () => {
  it.each([
    [0, "LOW"],
    [3, "LOW"],
    [4, "MEDIUM"],
    [7, "MEDIUM"],
    [8, "HIGH"],
    [11, "HIGH"],
    [12, "CRITICAL"],
    [15, "CRITICAL"],
  ] as const)("level %i → %s", (level, expected) => {
    const result = mapWazuhRuleLevelToRiskLevel(String(level));
    expect(result).toEqual({ ok: true, riskLevel: expected });
  });

  it("invalid / missing / out-of-range 不崩溃且返回失败原因", () => {
    expect(mapWazuhRuleLevelToRiskLevel("abc").ok).toBe(false);
    expect(mapWazuhRuleLevelToRiskLevel("3.5").ok).toBe(false);
    expect(mapWazuhRuleLevelToRiskLevel("-1").ok).toBe(false);
    expect(mapWazuhRuleLevelToRiskLevel("16").ok).toBe(false);
    expect(mapWazuhRuleLevelToRiskLevel("").ok).toBe(false);
  });
});

describe("normalizeWazuhAlert", () => {
  it("canonical sample：字段映射 + provenance + severity", () => {
    const result = normalizeWazuhAlert(JSON.stringify(CANONICAL_WAZUH));
    expect(result.input.sourceType).toBe("WAZUH");
    expect(result.input.externalAlertId).toBe("wazuh-demo-1712345678.123456");
    expect(result.input.alertTime).toBe("2026-08-10T03:15:22.000Z");
    expect(result.input.alertName).toBe(
      "sshd: authentication failed from untrusted source",
    );
    expect(result.input.description).toContain("Failed password for demo_ops");
    expect(result.input.sourceIp).toBe("198.51.100.24");
    expect(result.input.username).toBe("demo_ops");
    expect(result.input.destinationIp).toBe("10.0.0.21");
    expect(result.input.destinationPort).toBe(22);
    expect(result.input.protocol).toBe("tcp");
    expect(result.input.alertSeverity).toBe("HIGH");
    expect(result.input.alertSource).toBe("Wazuh");
    expect(result.input.failedLoginAttempts).toBeNull();
    expect(result.input.successfulLogin).toBeNull();

    const draft = buildSecurityCaseDraft(result.input, "wazuh-draft");
    expect(draft.alert.source).toBe("Wazuh");
    expect(draft.alert.severity).toBe("HIGH");
    expect(draft.alert.originalAlertId).toBe("wazuh-demo-1712345678.123456");
    expect(draft.identityContext.identityStatus).toBe("UNKNOWN");
  });

  it("username 固定优先级：srcuser → dstuser → user → username", () => {
    const onlyDst = normalizeWazuhAlert(
      JSON.stringify({
        id: "1",
        data: { dstuser: "dst_only", user: "user_only", username: "uname_only" },
      }),
    );
    expect(onlyDst.input.username).toBe("dst_only");

    const onlyUser = normalizeWazuhAlert(
      JSON.stringify({
        id: "2",
        data: { user: "user_only", username: "uname_only" },
      }),
    );
    expect(onlyUser.input.username).toBe("user_only");

    const onlyUsername = normalizeWazuhAlert(
      JSON.stringify({ id: "3", data: { username: "uname_only" } }),
    );
    expect(onlyUsername.input.username).toBe("uname_only");

    const srcWins = normalizeWazuhAlert(
      JSON.stringify({
        id: "4",
        data: {
          srcuser: "src_wins",
          dstuser: "dst",
          user: "u",
          username: "un",
        },
      }),
    );
    expect(srcWins.input.username).toBe("src_wins");
    expect(srcWins.unrecognized.some((u) => u.rawKey === "data.dstuser")).toBe(
      true,
    );
  });

  it("无 full_log 时 description fallback 到 rule.description", () => {
    const result = normalizeWazuhAlert(
      JSON.stringify({
        id: "5",
        rule: { description: "fallback description only", level: 5 },
      }),
    );
    expect(result.input.alertName).toBe("fallback description only");
    expect(result.input.description).toBe("fallback description only");
    expect(result.input.alertSeverity).toBe("MEDIUM");
  });

  it("missing level → alertSeverity null；invalid level 记入 unrecognized 且不阻断", () => {
    const missing = normalizeWazuhAlert(
      JSON.stringify({ id: "6", rule: { description: "no level" } }),
    );
    expect(missing.input.alertSeverity).toBeNull();
    expect(missing.input.alertName).toBe("no level");

    const invalid = normalizeWazuhAlert(
      JSON.stringify({
        id: "7",
        rule: { description: "bad level", level: "high" },
      }),
    );
    expect(invalid.input.alertSeverity).toBeNull();
    expect(invalid.input.alertName).toBe("bad level");
    expect(
      invalid.unrecognized.some(
        (u) => u.rawKey === "rule.level" && u.reason.includes("不是整数"),
      ),
    ).toBe(true);
  });

  it("未映射路径与复杂数组 warning 保留", () => {
    const result = normalizeWazuhAlert(JSON.stringify(CANONICAL_WAZUH));
    const keys = result.unrecognized.map((u) => u.rawKey);
    expect(keys).toContain("rule.id");
    expect(keys).toContain("agent.id");
    expect(keys).toContain("agent.name");
    expect(keys).toContain("manager.name");
    expect(keys).toContain("decoder.name");
    expect(keys).toContain("location");
    expect(keys).toContain("data.events");
    expect(
      result.unrecognized.some(
        (u) =>
          u.rawKey === "data.events" &&
          u.reason.includes("复杂数组暂不支持自动映射"),
      ),
    ).toBe(true);
  });

  it("不为文案推断 failedLoginAttempts / successfulLogin", () => {
    const result = normalizeWazuhAlert(
      JSON.stringify({
        id: "8",
        rule: {
          level: 10,
          description: "sshd: authentication failed / login failure",
        },
        full_log: "Failed password for invalid user from 203.0.113.10",
        data: { srcip: "203.0.113.10" },
      }),
    );
    expect(result.input.failedLoginAttempts).toBeNull();
    expect(result.input.successfulLogin).toBeNull();
    const analyzed = analyzeSecurityCase(
      buildSecurityCaseDraft(result.input, "wazuh-no-fabricate"),
    );
    expect(analyzed.identityContext.identityStatus).not.toBe("NORMAL");
  });

  it("generic JSON 行为不变：不把 Wazuh dotted path 当成全局 alias", () => {
    expect(matchFieldByHeader("data.srcip")).toBeNull();
    expect(matchFieldByHeader("rule.level")).toBeNull();
    expect(matchFieldByHeader("level")).toBeNull();
    expect(matchFieldByHeader("id")).toBeNull();

    const generic = normalizeJsonAlert(
      JSON.stringify({
        title: "Generic title",
        timestamp: "2026-08-10 01:00",
        src_ip: "10.0.0.8",
        user: "demo_user",
        level: "10",
      }),
      "OTHER",
    );
    expect(generic.input.alertName).toBe("Generic title");
    expect(generic.input.sourceIp).toBe("10.0.0.8");
    expect(generic.input.username).toBe("demo_user");
    expect(generic.input.alertSeverity).toBeNull();
    expect(generic.input.sourceType).toBe("OTHER");
    expect(generic.unrecognized.some((u) => u.rawKey === "level")).toBe(true);
  });

  it("alertSeverity 管道：generic 明确 LOW/MEDIUM/HIGH/CRITICAL 可解析", () => {
    const result = normalizeJsonAlert(
      JSON.stringify({
        title: "Severity plumbing",
        alert_severity: "critical",
      }),
      "FIREWALL",
    );
    expect(result.input.alertSeverity).toBe("CRITICAL");
    const draft = buildSecurityCaseDraft(result.input, "sev-draft");
    expect(draft.alert.severity).toBe("CRITICAL");
  });
});
