# v1.6 Release Acceptance

## Release candidate

- Branch: `integration/v1.6`
- HEAD: `f37dbff1c262eee57dc84a59342e8dc893dd1be6`
- Theme: Operational Readiness / Demo Reliability

## M1 — Critical E2E — COMPLETE

Covered paths:

- Analyst: login → Case → Business Context → Checklist → HumanReview → save/refresh
- Report: Case → report → edit/save → DOCX export
- Viewer: read-only access; mutations denied
- Fail-closed: resolver/runtime unavailable ≠ empty successful resolution

Current integration E2E (on this candidate):

- Phase 1 = 7 passed
- Phase 2 = 1 passed

## M2 — Demo/UI polish — COMPLETE

UI presentation / workflow only; no security or domain-semantics change.

- Checklist SYSTEM duplicate **presentation** grouping (display-only)
- Compliance technical/audit details de-emphasized and collapsed under「技术详情」
- Case first-screen workflow improved:
  - status / progress / next-step / navigation
  - Business Context / Evidence / Checklist / HumanReview moved forward

## M3 — Duplicate Analyze Performance — COMPLETE

Same-request duplicate full analyze reduced 2 → 1 for:

- Case detail load
- Report create
- Structured Business Context next-state analyze

Explicitly **not** introduced:

- no global cache
- no cross-request memoization
- no stale security result reuse

Parity regression covers:

- `analysisResults`
- `evidences`
- checklist / `verificationActions`
- `suggestedAssessment`
- `ReportData`

## Release invariants (unchanged in v1.6)

- `NORMAL | ABNORMAL | UNKNOWN` semantics; `UNKNOWN` ≠ `NORMAL`
- Human final conclusion remains manual
- Investigation Progress completion ≠ Case normal / safe / closable
- Compliance reference ≠ legal determination
- Frozen historical reports remain frozen
- Checklist evidence identity semantics unchanged
- Auth/RBAC unchanged

## Deferred / not part of v1.6

Deferred / future consideration (not cancelled; not a release blocker):

- Context Model v2 (M4)
- PostgreSQL migration
- schema/migrations
- external AI/API
- runtime Agent
