# v1.5 Milestone 4 — Backend & Release Integrity Audit

**Auditor:** Hermes (Workstream A — Audit Only)  
**Branch:** `agent/hermes-v1.5-release-hardening-audit`  
**Audit baseline commit:** `8545567190400de1fa0a555017c30e6d1baa7975`  
**Stated M3 freeze:** `integration/v1.5 @ 8545567`, tag `v1.5.0-m3`  
**Date:** 2026-08-10  
**Scope:** Audit only — **no runtime business code modified**

---

## Executive Summary

### Overall Release Readiness

| Audience | Verdict |
|---|---|
| **Local Demo / MVP evaluation** | **Conditionally ready** — domain integrity (M3) holds at baseline `8545567`; all gates green (556 tests). |
| **Production deployment** | **Not ready** — env/secrets hardening gaps, SQLite-only persistence (documented), release-branch/tag alignment issues. |

M3 correctness blockers (label-based Evidence RESOLVED, index-based Security identity, provenance OR fallback) are **fixed at baseline `8545567`**. Remaining issues are **release hardening**, **audit-trail integrity**, and **production configuration** — not re-opened M3 identity regressions.

### Baseline Alignment Finding (process)

| Check | Expected | Observed locally |
|---|---|---|
| `integration/v1.5` HEAD | `8545567` | `e1b87b6` (ahead; includes investigation-progress UI merge) |
| Tag `v1.5.0-m3` | points to `8545567` | **Tag not present** in local clone |
| Audit code reviewed | M3 frozen | ✅ Commit `8545567` (M3 Workstreams D/E/F present) |

**Classification:** `RELEASE_BLOCKER` for **formal v1.5.0-m3 release tagging** until integration HEAD or tag is reconciled with the stated freeze.

---

## Issue Register

### RELEASE_BLOCKER

| ID | Finding | Rationale |
|---|---|---|
| **RB-1** | `integration/v1.5` HEAD ≠ stated M3 baseline `8545567`; tag `v1.5.0-m3` missing locally | Release artifact, tag, and integration branch must agree before calling M3 frozen. |
| **RB-2** | `BETTER_AUTH_SECRET` placeholder in `.env.example` passes `requireAuthSecret()` (≥32 chars) | Copy-paste deploy can boot with a public, non-rotatable secret. Files: `.env.example`, `src/lib/auth.ts`. |
| **RB-3** | `DATABASE_URL` silently falls back to `file:./prisma/dev.db` | Misconfigured production can start against demo SQLite path. Files: `src/lib/prisma.ts`, `.env.example`. |
| **RB-4** | `npm run db:reset-demo` has no `NODE_ENV=production` guard | One mistaken ops command wipes all data. File: `scripts/reset-demo.ts`. |

### SHOULD_FIX_BEFORE_V1.5

| ID | Finding | Rationale |
|---|---|---|
| **SF-1** | `saveReportDraftCommand` persists client-supplied full `ReportData`, including `complianceReferences` | Contradicts “frozen at creation” intent; ANALYST with `REPORT_WRITE` can tamper snapshots via API. Files: `reportCommands.ts`, `caseRepository.ts`. |
| **SF-2** | Report draft OCC is check-then-act, not atomic `updateMany` on `reportUpdatedAt` | Concurrent tabs can last-write-win without `STALE_REPORT`. File: `caseRepository.ts`. |
| **SF-3** | Semantic commands (`updateBusinessContextCommand`, `applyChecklistCommand`, etc.) commit full client `nextCaseState` | Cross-field smuggling / incomplete audit trail (not VIEWER escalation). Files: `caseCommands.ts`, `commandActions.ts`. |
| **SF-4** | `applyBusinessContextCompletion` auto-completes checklist by **label**; can complete `SECURITY_VERIFICATION` items → Security Evidence RESOLVED via provenance gate without explicit evidence collection | BC confirmation cascades to Evidence RESOLVED for matching labels (e.g. “联系业务负责人”). Files: `generateChecklist.ts`, `analyzeSecurityCase.ts`. |
| **SF-5** | `destinationRegion` catalog marks `PRESENT` when only `externalDestination` exists | Region requirement may be falsely satisfied; compliance context gap. File: `investigationContext.ts` L216–222. |
| **SF-6** | Compliance runtime resolver failures return **empty panel** (fail-open for display) | Hides compliance gaps instead of explicit error. Files: `refreshCaseComplianceRuntime.ts`, `loadCaseWorkbenchRuntime.ts`. |
| **SF-7** | Case detail performs duplicate `analyzeSecurityCase` (server page + runtime loader; client re-analyzes) | Obvious perf cost on every load/refresh. Files: `cases/[id]/page.tsx`, `loadCaseWorkbenchRuntime.ts`, `PersistedCaseWorkbench.tsx`. |
| **SF-8** | No production runbook in README (`migrate deploy` → `bootstrap-admin` → `npm start`; explicit “no seed in prod”) | Ops misconfiguration risk. |
| **SF-9** | Server actions may return raw `error.message` to client on non-STALE failures | Possible internal detail leakage. Files: `cases/actions.ts`, `caseCommands.ts`. |

### NON_BLOCKING

| ID | Finding |
|---|---|
| **NB-1** | `mergeChecklistOnRestore` SYSTEM↔SYSTEM label fallback copies `completed/note/origin` but not `sourceKind/sourceRef` (KNOWLEDGE_SUGGESTED path protected). |
| **NB-2** | Editable compliance **section text** in report draft is intentional; separate from frozen `complianceReferences[]`. |
| **NB-3** | Internal `saveCaseState()` without `baseUpdatedAt` bypasses OCC — not exposed via server actions. |
| **NB-4** | SQLite-only persistence; README documents non-HA / non-prod-ready. |
| **NB-5** | No `middleware.ts`; auth via `(app)/layout.tsx` + Better Auth — acceptable for MVP. |
| **NB-6** | `confirmedAt` on HumanReview never set by semantic submit command (legacy round-trip only). |

### DEFERRED

| ID | Finding |
|---|---|
| **DF-1** | `CONTEXT_MODEL_GAPS`: operator, account-owner, business-purpose, incident-owner — documented, no schema this release. |
| **DF-2** | `LEGACY_SECURITY_EVIDENCE_INDEX_PROVENANCE` — index-based persisted checklist stays fail-closed OPEN (by design). |
| **DF-3** | Deprecated `getOrCreateReportDraft` — unused in production app code. |
| **DF-4** | Consolidate analyze/resolver passes — performance optimization, not correctness. |
| **DF-5** | Explicit Better Auth cookie attribute configuration — depends on HTTPS deployment. |

---

## 1. Domain / Investigation Progress Integrity

**Verdict: PASS at baseline `8545567`**

| Invariant | Status | Evidence |
|---|---|---|
| `UNKNOWN ≠ RESOLVED` | ✅ | `investigationProgress.ts` L109–113; tests in `investigationProgress.test.ts` |
| Completed checklist ≠ Case normal | ✅ | Progress does not write `finalConclusion` |
| Progress resolved ≠ Case closed | ✅ | No gate in `caseCommands` linking progress to `CLOSED` |
| Human review manual | ✅ | Progress reads `humanReview.finalConclusion` as fact only |

**M3 identity stack (present at `8545567`):**

- `securityEvidenceIdentity.ts` — `ruleId + actionId`, provenance gate
- Compliance Evidence: `KNOWLEDGE_SUGGESTED` + `sourceRef.kind === EVIDENCE` + exact `suggestionKey` (no label fallback)
- Security Evidence: `sourceKind === SECURITY_VERIFICATION` AND exact `suggestionKey` (M3F; no `relatedRuleId` OR)
- Legacy index provenance: fail-closed OPEN

**Residual false-positive path (not label-based Evidence matching):**

- `applyBusinessContextCompletion` → SF-4 (BC label auto-complete + SECURITY_VERIFICATION provenance)

**No additional unbounded theoretical attack scenarios audited beyond acceptance regressions (556 tests including M1/M2/M3 blocker suites).**

---

## 2. Persistence / Restore Integrity

**Verdict: PASS for save→reload core fields; SHOULD_FIX audit-trail gaps**

| Concern | Status |
|---|---|
| Checklist `completed` / `note` / MANUAL | ✅ `restoreWorkbench.test.ts`, `persistence.test.ts` |
| `sourceKind` / `sourceRef` / `suggestionKey` (KNOWLEDGE_SUGGESTED) | ✅ `fromComplianceSuggestion.test.ts` |
| BusinessContext / HumanReview round-trip | ✅ `restoreWorkbench.test.ts` |
| ReportDraft separate SoT | ✅ |
| Re-analysis merge | ✅ `mergeChecklistOnRestore` preserves user state |

**Gaps:** SF-3 (semantic command payload), SF-4 (BC-driven checklist side effects without evidence audit).

---

## 3. Frozen Report Integrity

**Verdict: Runtime paths PASS; save path SHOULD_FIX**

| Operation | Mutates `complianceReferences`? |
|---|---|
| Context update / compliance refresh | ❌ No — `refreshCaseComplianceRuntime.test.ts` |
| Progress refresh | ❌ No — `resolveInvestigationProgress.test.ts` |
| Checklist / HumanReview update | ❌ No auto-sync — `reportDraft.test.ts` |
| Report creation | ✅ Snapshots frozen once — `createReportDraftCommand` |
| Report save (client payload) | ⚠️ **Can overwrite** — SF-1 |

---

## 4. RBAC / Authorization

**Verdict: PASS server-side enforcement**

- `requirePermission` on all write server actions (`SERVER_ACTION_PERMISSIONS`)
- VIEWER write matrix: `serverAuthorization.test.ts` (all writes → `FORBIDDEN`)
- HumanReview: server-owned fields — `humanReviewResponsibility.test.ts`
- UI capabilities explicitly not the security boundary

**Gap:** SF-3 (trusted `nextCaseState` smuggling for ANALYST+).

---

## 5. Concurrency / OCC

**Verdict: Case paths PASS; Report path SHOULD_FIX**

- Semantic commands require `baseUpdatedAt`; atomic `updateMany` on case `updatedAt`
- Idempotency via `operationId` + audit lookup
- M1/M2/M3 runtime paths are **read-only projections** — no write competition
- Report: SF-2 (non-atomic version gate)

Regression: `caseConcurrency.test.ts`, `serverAuthorization.test.ts` OCC section.

---

## 6. Prisma / Migration

**Verdict: PASS (audit-only; no new migration)**

- `prisma validate` ✅
- `prisma migrate dev` — already in sync (5 migrations)
- No schema changes required for documented findings

---

## 7. Production Build / Start

**Verdict: PASS**

| Step | Result |
|---|---|
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ **556/556** |
| `npm run build` | ✅ |
| `npm start` (production) | ✅ `/login` → 200 (local + public IP verified during audit) |

Routes boot: `/cases`, `/cases/[id]`, `/reports`, `/login`, auth API.

---

## 8. Environment / Secrets

**Verdict: FAIL for production (RB-2, RB-3, RB-4)**

- `.env.example` documents SQLite demo DB and placeholder secret
- Demo user seed gated by `NODE_ENV !== production` ✅
- Bootstrap admin requires explicit env vars ✅
- Production must reject placeholder secrets and require explicit `DATABASE_URL`

---

## 9. Server Exposure / Security Basics

**Verdict: Acceptable for Demo MVP; not production-hardened**

- `disableSignUp: true` ✅
- No debug API routes found ✅
- Auth errors sanitized via `toAuthActionFailure` (partial — SF-9)
- No centralized security headers middleware (NB-5)
- CSRF: Next Server Actions origin check + session model — acceptable for MVP

---

## 10. Error / Failure Semantics

| Scenario | Behavior | Class |
|---|---|---|
| Stale OCC | Fail closed (`StaleCaseStateError`) | ✅ |
| Unknown rule/action | Skipped safely | ✅ |
| Malformed provenance URL | Sanitized to null | ✅ |
| Compliance resolver failure | Empty panel (fail-open display) | SF-6 |
| DB write failure | Transaction rollback | ✅ (message leak SF-9) |

---

## 11. Performance Smoke

| Observation | Class |
|---|---|
| Case detail: 2–3× `analyzeSecurityCase` per load | SF-7 |
| Progress reuses analyzed case (no triple analyze in progress path) | OK |
| Knowledge graph: batched queries, no obvious N+1 | OK |
| `router.refresh` after persist: re-read only, no spurious writes | OK |

No performance issue elevated to RELEASE_BLOCKER.

---

## 12. Regression Coverage

All suites pass at `8545567`:

- M1 compliance runtime refresh
- M2 Investigation Context Catalog
- M3 Investigation Progress + Evidence identity (D/E/F blocker tests)
- v1.4 Knowledge / compliance pack
- v1.3 Auth / RBAC / OCC
- Reports / Case A/B / frozen report

**Total: 556 tests, 55 files.**

---

## 13. Gates (Executed)

```
lint          ✅ pass
tsc           ✅ pass
tests         ✅ 556/556 pass
build         ✅ pass
prisma validate ✅ pass
production start smoke ✅ /login 200
```

---

## 14. Runtime Code Changed?

**No.** This audit added only `docs/v1.5/M4_BACKEND_AUDIT.md`.

---

## 15. Suggested M4 Fix Workstreams

| WS | Focus | Addresses |
|---|---|---|
| **M4-B1** | Release integrity | Reconcile `integration/v1.5` + tag `v1.5.0-m3` with `8545567`; release checklist |
| **M4-B2** | Production env guards | Reject placeholder secret; require `DATABASE_URL`; guard `db:reset-demo` |
| **M4-B3** | Frozen report hardening | Preserve server `complianceReferences` on save; atomic report OCC |
| **M4-B4** | Command payload canonicalization | Server-build `nextCaseState` per semantic command (mirror HumanReview pattern) |
| **M4-B5** | BC ↔ Evidence boundary | Decouple `applyBusinessContextCompletion` from Security Evidence RESOLVED (or audit explicitly) |
| **M4-B6** | Catalog semantic fix | `destinationRegion` requires distinct region signal (or document proxy semantics) |
| **M4-B7** | Perf smoke | Dedupe server-side analyze on case detail load |

---

## Appendix: Files Reviewed (representative)

- `src/domain/investigationContext.ts`
- `src/domain/investigationProgress.ts`
- `src/domain/securityEvidenceIdentity.ts`
- `src/services/knowledge/refreshCaseComplianceRuntime.ts`
- `src/services/knowledge/resolveCaseCompliance.ts`
- `src/services/knowledge/resolveInvestigationContext.ts`
- `src/services/knowledge/resolveInvestigationProgress.ts`
- `src/services/checklist/generateChecklist.ts`
- `src/services/persistence/caseMapper.ts`
- `src/services/persistence/caseRepository.ts`
- `src/services/caseCommands/caseCommands.ts`
- `src/services/caseCommands/reportCommands.ts`
- `src/services/auth/requirePermission.ts`
- `.env.example`, `package.json`, `scripts/reset-demo.ts`

---

**STOP — Audit complete. No merge to `integration/v1.5`.**
