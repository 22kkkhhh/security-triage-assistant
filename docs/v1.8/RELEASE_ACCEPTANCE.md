# v1.8 Release Acceptance

## Release candidate

- Branch: `integration/v1.8` → promote `main`
- Theme: Investigation Intelligence
- Previous stable: `main` @ `04e9b8b43b60ce3b9b1d133b3beb0fda5aeab998`（Apache-2.0）+ tag `v1.7.0` peel `62d7548fca281c473ab32290bcbc492a2c51157f`
- M2 complete baseline: `701d6c4d211ea8f4934f2298c6893ef0e20f570d`

## Release scope

### M1 — Historical Case Correlation — COMPLETE

- Current Case → Related Cases（explicit reasons）
- Dimensions: username / sourceIp / accessedSystems / externalAlertId
- `SAME_ALERT_SOURCE` additive only；alone ≠ related
- null / empty ≠ match；current Case excluded
- Window: last 30 days；result cap: 5
- Coverage: `findRelatedCases` / window loader contracts / Related Cases UI / `related-cases` E2E

### M2 — Historical Signals + Investigation Leads — COMPLETE

- Related Cases → Historical Signals → Investigation Leads（pure function；no second DB scan）
- Signal codes: `RECURRING_USERNAME` / `RECURRING_SOURCE_IP` / `RECURRING_SYSTEM` / `REPEATED_EXTERNAL_ALERT_ID`
- Lead codes capped at 4；「建议核查」文案；不落库 / 非 Checklist
- Workbench「历史调查线索」+ nav「历史线索」；Related Case cards retained
- Coverage: `buildInvestigationIntelligence` unit / UI contracts / extended `related-cases` E2E

### M3 — Release Readiness — COMPLETE（docs-only）

- README → v1.8.0
- CHANGELOG catch-up：v1.5.0 / v1.6.0 / v1.7.0 / v1.8.0
- 本文件
- **No production feature code in M3**

## Final regression audit

Existing unit / component / E2E coverage reviewed for M1+M2 acceptance criteria.

| Invariant | Coverage |
|---|---|
| Related reasons / 30d / max 5 / exclude current | Unit — sufficient |
| null ≠ match；source-only ≠ related | Unit — sufficient |
| Signals aggregation；SAME_ALERT_SOURCE alone ≠ signal | Unit — sufficient |
| Leads dedup / max 4 / ordering | Unit — sufficient |
| historical risk ≠ current escalation；HumanReview untouched | Unit + E2E — sufficient |
| SuggestedAssessment / HumanReview unchanged after Related navigation | E2E — sufficient |
| Viewer readonly not broken by historical panel | Existing `viewer-readonly` E2E + CASE_READ panel — sufficient |
| correlation ≠ same incident；lead ≠ Checklist | UI contract + labels — sufficient |

**Release blockers found:** none.  
**Blocker production fixes in M3:** none.

## Demo smoke（judgment）

Based on M2 full Verification (`related-cases` E2E) + existing Analyst / Viewer E2E paths:

- Analyst：Case → Investigation Overview → 历史调查线索 → Signals / Leads → Related Case → return → Business Context / Evidence / HumanReview
- Viewer：历史信息可读；现有 readonly 写边界未被破坏

No visual pixel acceptance required.

## Final test counts（pre-tag baseline）

On integration @ `701d6c4…`（M2 Verification [#31426750835](https://github.com/22kkkhhh/security-triage-assistant/actions/runs/31426750835)）；M3 docs-only candidate re-verified on GitHub:

- `npm test`: 80 files / 828 passed
- E2E Phase 1: 9 passed
- E2E Phase 2: 1 passed
- Prisma schema / migrations: **unchanged** in v1.8（no new migration）

## Release invariants

- `UNKNOWN` ≠ `NORMAL`
- `SuggestedAssessment` ≠ `HumanReview`
- Related Case ≠ same security incident
- Historical Signal ≠ attack confirmation
- Investigation Lead ≠ security conclusion
- Investigation Lead ≠ persisted Checklist
- historical HumanReview ≠ current HumanReview
- historical risk ≠ automatic current risk escalation
- Checklist / progress completion ≠ Case resolved
- Compliance ≠ legal conclusion
- historical reports remain frozen

## Known non-blockers

- Demo seed A/B primarily exercises `SHARED_SYSTEM` / `RECURRING_SYSTEM` path；username/IP/alert-id aggregation covered by unit tests
- Overview / nav a11y naming conventions inherited from v1.7（no change required for v1.8）

## Explicitly deferred（not v1.8）

- Case merge
- incident graph
- attack chain
- MITRE ATT&CK
- threat intelligence
- IOC reputation
- LLM
- embeddings
- vector DB
- clustering
- probability scoring
- automatic risk escalation
- auto checklist generation
- cross-tenant / Case ACL

## Open-source governance

- `LICENSE` = Apache License 2.0（正文未改）
- README License section retained
- `package.json` `"license": "Apache-2.0"`
- Copyright: 2026 22kkkhhh
