import { describe, expect, it } from "vitest";
import { normalizeWazuhAlert } from "@/services/intake/wazuhAlertAdapter";

describe("公开样本字段映射", () => {
  it("支持 Wazuh JSON decoder 常见的根级网络字段", () => {
    const result = normalizeWazuhAlert(
      JSON.stringify({
        id: "suricata-demo-1",
        timestamp: "2023-05-02T17:46:48.515262+0000",
        rule: { level: 3, description: "Suricata network alert" },
        src_ip: "16.10.10.10",
        dest_ip: "16.10.10.11",
        dest_port: 80,
        proto: "TCP",
        alert: { signature: "Possible web attack" },
      }),
    );

    expect(result.input.sourceIp).toBe("16.10.10.10");
    expect(result.input.destinationIp).toBe("16.10.10.11");
    expect(result.input.destinationPort).toBe(80);
    expect(result.input.protocol).toBe("TCP");
  });

  it("支持 pgAudit / Office365 风格的操作、数据库和表字段", () => {
    const result = normalizeWazuhAlert(
      JSON.stringify({
        id: "audit-demo-1",
        timestamp: "2026-08-28T06:00:00.000Z",
        rule: { level: 7, description: "Database audit event" },
        data: {
          operation: "SELECT",
          database: "crm",
          table_name: "public.customers",
          rows: "12",
          srcuser: "analyst01",
        },
      }),
    );

    expect(result.input.operation).toBe("SELECT");
    expect(result.input.database).toBe("crm");
    expect(result.input.tableName).toBe("public.customers");
    expect(result.input.rowsAffected).toBe(12);
    expect(result.input.username).toBe("analyst01");
  });
});
