# v1.7 Release Acceptance

## Release candidate

- Branch: `integration/v1.7`
- Baseline (M4 complete): `b23b62810ccc6b57c5a624d2067719bbfc50c4df`
- Theme: Alert Intake & Investigation Workbench
- Previous stable: `main` @ `8fbdcd8d455efd0758e42b3e117dc5c40cc57108` (`v1.6.0`)

## Scope summary

### M1 — Generic JSON Intake — COMPLETE

- Single-object JSON alert upload on `/cases/new`
- Flatten + field alias normalize → ConfirmationPanel → human confirm → `createCaseAction`
- Non-manual provenance default `OTHER` (not `MANUAL`)
- Coverage: unit (`parseJsonAlert` / `jsonImportModel`) + create-case persistence paths

### M2 — Rule Quality + Golden Cases — COMPLETE

- Safer UNKNOWN handling; business-context risk aggregation improvements
- Golden Case baseline (`goldenCases.test.ts`) all PASS
- Coverage: analysis / suggestedAssessment / UNKNOWN invariants

### M3 — Case Workbench UX Refresh — COMPLETE

- Investigation Overview (risk / abnormal / UNKNOWN / pending / next step)
- Sticky secondary navigation (anchor scroll; no remount tabs)
- Human investigation before system reference; Evidence+Checklist workspace
- Coverage: unit/UI contracts + `case-next-step` E2E

### M4 — Wazuh Intake — COMPLETE

- `ImportSourceType.WAZUH` + deterministic Wazuh adapter
- Internal `rule.level` → RiskLevel ingestion policy (not “official equivalent”)
- Unmapped paths / complex-array warnings retained
- Coverage: unit adapter/severity + `wazuh-intake` E2E (preview → Case → provenance)

## Final regression audit (release readiness)

Existing tests were reviewed; **no new product features** and **no extra test sprint**.

| Capability | Coverage status |
|---|---|
| A. Generic JSON → preview → Case | Unit + createCase path — sufficient |
| B. Wazuh JSON → mapping/severity/preview/Case/provenance | Unit + E2E — sufficient |
| C. Rule quality / Golden Cases / UNKNOWN≠NORMAL / AUTHORIZED≠unconditional LOW / HumanReview not overwritten | Unit — sufficient |
| D. Workbench Overview / next step / nav / Evidence+Checklist / Business Context / Human Review | Unit + E2E — sufficient |
| E. Viewer readonly | E2E `viewer-readonly` — sufficient |
| F. Report view / edit path | E2E `report` + persistence report tests — sufficient |

**Blockers found in this closeout:** none.  
**Production code changes in M5:** none (docs-only).

## Demo readiness

Smoke judgment based on latest full Verification on M4 integration HEAD (`b23b628…`) plus local `npm test` on release-readiness baseline:

- Analyst JSON / Wazuh intake paths exercised by unit + Wazuh E2E
- Workbench next-step / investigation flow: `case-next-step` + analyst investigation E2E
- Viewer readonly: `viewer-readonly` E2E
- Report path: `report` E2E

No visual pixel acceptance; no release blocker observed.

## Final test counts (pre-tag baseline)

On integration @ `b23b628…` (Verification [#31421343399](https://github.com/22kkkhhh/security-triage-assistant/actions/runs/31421343399)):

- `npm test`: 76 files / 799 passed
- E2E Phase 1: 8 passed
- E2E Phase 2: 1 passed
- Prisma schema / migrations: **unchanged** in v1.7 (no new migration)

## Release invariants

- `UNKNOWN` ≠ `NORMAL`
- System suggested assessment ≠ HumanReview (final conclusion remains manual)
- Checklist / investigation progress completion ≠ Case resolved / safe / closable
- `AUTHORIZED` business context ≠ technology anomaly disappeared
- Compliance reference ≠ legal conclusion
- Historical reports remain frozen
- Wazuh `rule.level` mapping = **internal ingestion policy**, not a Wazuh official RiskLevel equivalent standard

## Known non-blockers

- Overview report shortcut uses distinct「快捷*报告」labels to avoid duplicate a11y names with bottom CTA
- Workbench section wrappers avoid nested `<section>` for stable E2E locators
- Generic JSON has no dedicated Playwright path; covered by unit + shared ConfirmationPanel/createCase path (Wazuh E2E covers JSON UI)

## Explicitly deferred (not v1.7)

- webhook
- batch import
- JSONL
- streaming ingest
- externalAlertId dedup
- raw JSON persistence
- Wazuh API connection
- ML baseline
- Context Model v2
