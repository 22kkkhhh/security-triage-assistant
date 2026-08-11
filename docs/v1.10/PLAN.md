# v1.10 Plan

## Theme

Human-centered UX

## M1 — Case Workbench IA Redesign

原则：

- task first
- progressive disclosure
- human decision > system suggestion
- preserve domain semantics

范围：

- 主导航 7 → 4（概览 / 调查 / 分析 / 记录）
- Overview 降噪 + Next Step 优先
- 调查四步：业务确认 → 证据与核查 → 历史线索 → 最终研判
- Historical compact / expand
- Analysis / Records progressive disclosure
- single page + anchor + disclosure（不拆 route tabs）

## M2 — Global UI Consistency

原则同 M1，扩展到主要产品页面。

范围：

- Case List：主列精简；账号/系统并入案件单元格；mobile 紧凑行
- Intake：3 步 presentation；method segmented；确认步骤强化
- Comparison：共同事实优先；差异 category disclosure；mobile 可读
- Report：document-like 编辑；轻量 toolbar；预览阅读宽度
- Global：PageHeader / page width / button hierarchy / AppShell 调查工作台气质
- Workbench：仅 Audit 默认 collapsed（Timeline 仍默认 open）

## M3 — Release Readiness

- Case List risk-source clarity（人工 · / 系统建议 ·）
- README / CHANGELOG / RELEASE_ACCEPTANCE
- Promote `main` + annotated `v1.10.0`
