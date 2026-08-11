# v1.9 Plan

## Theme

Comparative Investigation

## M1 — Case Comparison Workspace

- Related Case →「对比调查」入口
- Route: `/cases/{currentId}/compare/{relatedId}`
- Server-side two-case load + pair correlation（复用 v1.8 semantics）
- Shared / different facts；历史研判只读参考
- Zero-write compare page

## M2 — Actionable Investigation Leads

- Analyst opt-in：「加入核查清单」
- Server 重算 intelligence 校验 leadCode；专用 Server Action
- `origin=MANUAL` + `sourceKind=INVESTIGATION_LEAD` + leadKey provenance
- Semantic dedup + operationId 幂等；复用 `applyChecklistCommand` / Audit
- 可 complete / reopen / delete；accepted item 冻结
- 不自动加入 Checklist；不改 risk / HumanReview / CaseStatus

## M3 — Release

（后续）
