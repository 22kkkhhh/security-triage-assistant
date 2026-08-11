# v1.9 Release Acceptance

## Theme

Comparative Investigation

## Release candidate

- Branch: `integration/v1.9` → promote `main`
- Previous stable: `main` @ `42c311787fece401f526ca14e0994c9d0030ec12` + tag `v1.8.0` peel `42c311787fece401f526ca14e0994c9d0030ec12`
- M2 complete baseline: `96c6b38f80a62805a0c1f60cd43714a7ce0b8a99`
- Final release SHA: M3 docs closeout commit（与 annotated tag `v1.9.0` peeled commit 相同）

## Release scope

### M1 — Case Comparison Workspace — COMPLETE

- Related Case →「对比调查」→ `/cases/{currentId}/compare/{relatedId}`
- Server-side two-case load + pair correlation（复用 v1.8 semantics）
- Shared / different facts；missing data 显式表示
- Historical judgment 只读参考；与当前 Case 研判严格分离
- Zero-write compare page
- Coverage: `buildCaseComparison` unit / `caseComparisonUi` / `case-comparison` E2E

### M2 — Actionable Investigation Leads — COMPLETE

- Historical Signals → Investigation Leads（runtime recommendation）
- Analyst opt-in「加入核查清单」
- Server：`CHECKLIST_WRITE` → recompute intelligence → validate leadCode → canonicalize → `applyChecklistCommand`
- `origin=MANUAL` + `sourceKind=INVESTIGATION_LEAD` + `leadKey` provenance
- Semantic dedup + operationId 幂等；Audit `CHECKLIST_ADDED`
- complete / reopen / delete；accepted item 冻结
- Generic Checklist add 拒绝 Client 伪造 `INVESTIGATION_LEAD`
- Coverage: `fromInvestigationLead` / `investigationLeadChecklistCommand` / `actionableLeadsUi` / `actionable-leads` E2E

### M3 — Release Readiness — COMPLETE（docs-only）

- README → v1.9.0
- CHANGELOG → v1.9.0
- 本文件 + PLAN M3 收口
- **No production feature code in M3**

## Final regression audit

Existing unit / component / E2E coverage reviewed for M1+M2 acceptance criteria.

| Invariant | Coverage |
|---|---|
| Related → compare → shared/different/missing；judgment separation | Unit + E2E — sufficient |
| Compare page zero-write；return 不改当前研判 | E2E — sufficient |
| Lead opt-in → Server revalidation → Checklist + provenance + Audit | Unit + E2E — sufficient |
| Generic add cannot forge INVESTIGATION_LEAD | Unit — sufficient |
| leadKey semantic dedup across operationIds | Unit — sufficient |
| complete / reopen / delete lead item | Unit + E2E — sufficient |
| Related ≠ same incident；Lead ≠ conclusion；Lead ≠ auto Checklist | UI + E2E labels — sufficient |
| historical risk/HumanReview ≠ current escalation | Unit + E2E — sufficient |
| Checklist completion ≠ Case resolved | Existing progress semantics — sufficient |
| UNKNOWN ≠ NORMAL | Existing domain baseline — sufficient |
| Viewer：Related/Compare/Leads 可读；无 opt-in 写入口 | UI capability + existing Viewer E2E — sufficient |

**Release blockers found:** none.  
**Blocker production fixes in M3:** none.

## Demo smoke（judgment）

Based on M1/M2 full Verification + existing Analyst / Viewer E2E paths:

- Analyst：Case → 历史调查线索 → Related → 对比调查 → 返回 → Lead opt-in → Checklist → complete/reopen → Human Review
- Viewer：Related / Compare / Leads 可读；无「加入核查清单」；无 `CHECKLIST_WRITE`

No visual pixel acceptance required.

## Final test counts（pre-tag baseline）

On integration @ `96c6b38…`（M2 Verification [#31456336492](https://github.com/22kkkhhh/security-triage-assistant/actions/runs/31456336492)）；M3 docs-only candidate re-verified on GitHub:

- `npm test`: 85 files / 855 passed
- E2E Phase 1: 11 passed
- E2E Phase 2: 1 passed
- Prisma schema / migrations: **unchanged** in v1.9（no new migration）
- Permissions: **no new Permission**；复用 `CHECKLIST_WRITE`

## Release invariants

- `UNKNOWN` ≠ `NORMAL`
- `SuggestedAssessment` ≠ `HumanReview`
- Related Case ≠ same security incident
- Case Comparison ≠ attack attribution
- Historical Signal ≠ attack confirmation
- Investigation Lead ≠ security conclusion
- runtime Lead ≠ persisted Checklist（仅 analyst opt-in 后落库）
- historical HumanReview ≠ current HumanReview
- historical risk ≠ automatic current risk escalation
- Checklist completion ≠ Case resolved / incident confirmed
- Compliance ≠ legal conclusion
- historical reports remain frozen

## Known non-blockers

- Demo seed A/B 主要覆盖 `SHARED_SYSTEM` / `COMPARE_SHARED_SYSTEM_ACTIVITY` 路径；其余 lead/signal 映射由单测固定
- Compare UI 为工作台级信息密度，非 pixel-perfect 验收对象

## Explicitly deferred（not v1.9）

- Case merge
- Incident entity
- incident graph
- attack chain
- timeline merge
- report comparison
- MITRE ATT&CK
- threat intelligence
- IOC reputation
- AI / LLM
- embeddings / vector DB
- probability scoring
- automatic risk escalation
- automatic checklist creation
- assignment / owner / due date
- notifications / SLA

## Open-source governance

- `LICENSE` = Apache License 2.0（正文未改）
- README License section retained
- `package.json` `"license": "Apache-2.0"`
- Copyright: 2026 22kkkhhh
