# Public-format test samples

These fixtures are **脱敏、演示用途** samples based on public vendor documentation. They are realistic in structure and field names, but are not copied from an organization's production logs.

## Sources

- Wazuh JSON decoder / Suricata input and `wazuh-logtest` output: <https://documentation.wazuh.com/current/user-manual/ruleset/decoders/json-decoder.html>
- Wazuh Office 365 alert shape: <https://documentation.wazuh.com/current/cloud-security/office365/monitoring-office365-activity.html>
- pgAudit session audit output: <https://github.com/pgaudit/pgaudit>

## Intended use

- `wazuh-suricata-alert.jsonl` checks root-level network fields and alert provenance.
- `wazuh-office365-user-event.jsonl` checks integration, user and operation fields.
- `pgaudit-session.log` preserves the original text format; use it as a reference for a JSON wrapper or a future text adapter.

All identifiers, hosts, IPs and email addresses are documentation-safe examples. Do not treat these samples as proof of an incident or as a compliance conclusion.
