# v1.11 Release Acceptance

## Theme

Case Operations

## Release candidate

- Branch: `integration/v1.11` → promote `main`
- Previous stable: `main` @ `68a80e12f57416174882f8c5415874c6124ed88d` + tag `v1.10.0`
- M2 complete baseline: `aa39b4541271444378dcbff83f1e5f35ad819f8a`
- Final release SHA: M3 release commit（与 annotated tag `v1.11.0` peeled commit 相同）

## Release scope

### M1 — Case Ownership & My Queue — COMPLETE

- `CaseRecord.assignedToUserId` / `assignedAt` 为 ownership 唯一 SoT（不写入 `caseState`）
- Permission `CASE_ASSIGN`：VIEWER ✗ / ANALYST ✓ / ADMIN ✓
- Analyst：未分配案件自助接手；释放自己负责的案件
- Admin：任意案件 assign / reassign / unassign（仅 enabled ADMIN/ANALYST 可被指派）
- 队列范围：全部 / 我的 / 未分配；`scope=mine` 使用 Server 可信 `user.id`
- Semantic Command `assignCaseCommand` + Audit `CASE_ASSIGNED` / `CASE_UNASSIGNED`

### M2 — Operational Prioritization & Due Dates — COMPLETE

- `CaseRecord.dueAt` 为 deadline 唯一 SoT（不写入 `caseState`）
- Permission `CASE_DUE_DATE_WRITE`：VIEWER ✗ / ANALYST ✓ / ADMIN ✓
- Analyst：仅可修改自己负责案件的截止时间；Admin：任意案件
- Due-state：`NONE | OVERDUE | DUE_TODAY | UPCOMING | CLOSED`，显式 `now` + UTC+8 日历日语义
- 队列排序：`sort=recent`（默认）/ `sort=due`，可与 scope / q / status / risk 组合
- Semantic Command `setCaseDueAtCommand` + Audit `CASE_DUE_DATE_CHANGED`

### M3 — Release Readiness — COMPLETE

- Final migration / regression audit（见下）
- README → v1.11.0；CHANGELOG → v1.11.0；本文件
- `PRODUCT_BOUNDARY.md` 已在 M1/M2 更新且与实际能力一致，本轮不重写
- Promote `main` + annotated tag `v1.11.0` + GitHub Release

## Final migration audit

v1.11 保留两个独立 migration，验收后未 squash / rename / 编辑：

| Migration | 内容 |
|---|---|
| `20260811080000_add_case_ownership` | `assignedToUserId` / `assignedAt` + FK(Restrict) + index |
| `20260811120000_add_case_due_at` | `dueAt` + `CaseRecord_dueAt_idx`（仅此新增列） |

验证结果：

- Clean DB → 7 个 migration 全部 PASS
- v1.10 DB → ownership migration → dueAt migration PASS
- SQLite table rebuild 后逐字段核对：`id` / `caseNumber` / `caseState` / `reportDraft` /
  `status` / `suggestedRiskLevel` / `humanRiskLevel` / `humanConclusion` / `lastActivityAt` /
  `createdAt` / `updatedAt` / `closedAt` / `reportUpdatedAt` / `hasReport` /
  `pendingChecklistCount` / `username` / `sourceIp` / `systemsSearchText` 全部不变
- Audit 行与 `CaseAuditLog → CaseRecord` 外键关系保留，`foreign_key_check` 无冲突
- 历史 Case：`assignedToUserId` / `assignedAt` / `dueAt` 均为 `NULL`（无猜测 backfill）

## Final regression audit

| Area | Status |
|---|---|
| M1 ownership SoT / rules / queue scopes | Unit + command + queue tests |
| M2 dueAt SoT / owner-aware rules / due-state | Unit + command + due-state tests |
| Semantic command pipeline（trusted actor → permission → business rule → `baseUpdatedAt` → CAS → transaction → Audit → operationId → stale） | `assignCaseCommand` / `setCaseDueAtCommand` tests |
| 同值 no-op 不产生重复 Audit / lastActivity | Command tests |
| Ownership / deadline 不改分析与研判语义 | Invariant assertions |
| Analyst / Admin / Viewer 端到端 | `case-ownership.spec.ts` / `case-due-date.spec.ts` |
| 既有调查 / 报告 / 导入 / Viewer 只读 | Existing E2E suite |

**Release blockers found:** 无。
**Non-blockers recorded, not fixed:** `sort=due` 目前为 DB fetch + Node 确定性排序，
本地 MVP 规模可接受；大规模 Case / pagination 场景未来可改为 DB-level due sorting。

## Permissions

v1.11 恰好新增两个粗粒度 Permission，无第三个：

| Permission | VIEWER | ANALYST | ADMIN |
|---|---|---|---|
| `CASE_ASSIGN` | ✗ | ✓ | ✓ |
| `CASE_DUE_DATE_WRITE` | ✗ | ✓ | ✓ |

具体业务限制（Analyst 仅限自己负责的案件等）继续在 Server rule 层执行。

## Audit

v1.11 新增 Audit 类型：`CASE_ASSIGNED`、`CASE_UNASSIGNED`、`CASE_DUE_DATE_CHANGED`。
Assignment / due date 属于 Audit，**不是** Timeline；成功操作经既有 Audit 路径更新
`lastActivityAt`，未引入第二套 activity timestamp。

## Invariants

- Ownership `!=` Case ACL（不改变案件可见性）
- Ownership `!=` HumanReview reviewer
- `dueAt` `!=` security risk
- `dueAt` `!=` SLA / 法定或合规期限
- `OVERDUE` `!=` HIGH risk；`OVERDUE` `!=` incident；`OVERDUE` `!=` 状态升级
- Deadline completion `!=` Case resolved
- No automatic assignment
- No automatic priority score
- No automatic escalation
- `UNKNOWN != NORMAL`
- `SuggestedAssessment != HumanReview`
- Viewer remains readonly
- Historical reports remain frozen

## Final test counts

Filled at release closeout from GitHub Verification on final SHA:

- `npm test`: see release report
- E2E Phase 1 / Phase 2: see release report
- Prisma migrations: **2 new** in v1.11（ownership + dueAt）
- Dependencies: **unchanged**
- Permissions: **2 new**（`CASE_ASSIGN` + `CASE_DUE_DATE_WRITE`）

## Deferred（not committed for a next version）

- Teams / departments
- Multi-tenant / Case ACL
- Workload balancing
- Round-robin assignment
- Pagination-aware DB due sorting
- SLA policies
- Escalation
- Notifications
- Email
- Calendar integration
- Priority scoring
- AI

## License

Apache-2.0 — Copyright 2026 22kkkhhh.
