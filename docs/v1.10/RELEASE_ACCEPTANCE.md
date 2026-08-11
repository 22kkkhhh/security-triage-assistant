# v1.10 Release Acceptance

## Theme

Human-centered UX

## Release candidate

- Branch: `integration/v1.10` → promote `main`
- Previous stable: `main` @ `32d4af9663d26617b7efdebc61c5a378d5e835cf` + tag `v1.9.0`
- M2 complete baseline: `eefc4b75e6db7f4f1f250f0d4b8e3fcfb5fdf99d`
- Final release SHA: M3 release commit（与 annotated tag `v1.10.0` peeled commit 相同）

## Release scope

### M1 — Case Workbench IA Redesign — COMPLETE

- Four main nav: 概览 / 调查 / 分析 / 记录
- Next Step first on Overview
- Investigation four steps: 业务确认 → 证据与核查 → 历史线索 → 最终研判
- Checklist-first；Evidence secondary disclosure
- Historical compact / expand
- Analysis progressive disclosure
- HumanReview as final investigation step
- Single page + anchor + disclosure（no route tabs）

### M2 — Global UI Consistency — COMPLETE

- Case List reduced hierarchy + mobile rows
- New Case 3-step presentation
- Compare shared-facts first + category disclosure + mobile-readable diffs
- Document-like Report editor + unified toolbar
- PageHeader / PageFrame / action hierarchy
- Audit default collapsed；Timeline default open
- AppShell「调查工作台」气质

### M3 — Release Readiness — COMPLETE

- **Production blocker fix：** Case List risk-source clarity  
  (`resolveCaseListRiskDisplay` → `人工 · 高风险` / `系统建议 · 高风险` / `暂无法评级`)
- README → v1.10.0
- CHANGELOG → v1.10.0
- 本文件
- Promote `main` + annotated tag `v1.10.0` + GitHub Release

## Final regression audit

| Area | Status |
|---|---|
| M1 Workbench IA | Accepted on integration Verification |
| M2 Global UI | Accepted on integration Verification |
| Case List risk source（desktop + mobile） | Unit + page contract |
| Cases search/filter → open → Next Step → BC → Checklist → Lead → HumanReview → Compare → Report | Existing E2E suite |
| New Case Manual/CSV/JSON/Wazuh/Text → Confirmation → Create | Existing intake E2E |
| Viewer readonly | Existing Viewer E2E |

**Release blockers found:** Case List risk source ambiguity（fixed in M3）.  
**Non-blockers recorded, not fixed:** residual spacing/typography polish; no Dark Mode; no richer record filters.

## Invariants

- `UNKNOWN != NORMAL`
- `SuggestedAssessment != HumanReview`
- 系统建议风险 != 人工风险（Case List 展示带来源前缀）
- Related Case != same incident
- Investigation Lead requires analyst opt-in
- Checklist completion != Case resolved
- Compliance != legal conclusion
- Viewer remains readonly
- Historical reports remain frozen

## Final test counts

Filled at release closeout from GitHub Verification on final SHA:

- `npm test`: see release report
- E2E Phase 1 / Phase 2: see release report
- Prisma schema / migrations: **unchanged** in v1.10（no new migration）
- Dependencies: **unchanged**
- Permissions: **unchanged**

## Deferred（not committed for a next version）

- Dark Mode / theme system / design-system package
- Charts / dashboard
- Richer record filtering / saved UI preferences / drag-drop
- New security capabilities / AI / LLM

## License

Apache-2.0 — Copyright 2026 22kkkhhh.
