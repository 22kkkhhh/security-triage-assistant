# v1.8 Plan

## Theme

Historical Case Correlation + Investigation Intelligence + open-source baseline continuity.

## M1 — Historical Case Correlation

- Deterministic Related Cases on Case Workbench（no AI / no probability）
- Dimensions: username, sourceIp, accessedSystems, originalAlertId；alert.source 仅作附加 reason
- Window: last 30 days；cap: 5
- Server-side query under `CASE_READ`；no Prisma migration

## M2 — Investigation Intelligence

- Pure function `buildInvestigationIntelligence(relatedCases, currentAnalysisHints)`
- Historical Signals: `RECURRING_USERNAME` / `RECURRING_SOURCE_IP` / `RECURRING_SYSTEM` / `REPEATED_EXTERNAL_ALERT_ID`
- `SAME_ALERT_SOURCE` 不得单独生成重复活动信号
- Investigation Leads（最多 4；建议核查文案；不落库 / 非 Checklist）
- UI：「历史调查线索」+ 导航「历史线索」；保留 Related Case cards
- 不继承历史 HumanReview / 不自动提升当前风险；不修改 `src/services/analysis/**`
- DB：Related Cases 只查一次，Intelligence 不再扫库

## M3 — Release Readiness + v1.8.0 Closeout

- Docs-only：README v1.8.0、CHANGELOG catch-up、`RELEASE_ACCEPTANCE.md`
- No new product features；no Prisma migration
- Promote `integration/v1.8` → `main`；annotated tag `v1.8.0`
