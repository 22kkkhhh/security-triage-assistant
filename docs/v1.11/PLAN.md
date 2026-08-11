# v1.11 Plan — Case Operations

Theme: **Case Operations**

## Milestones

| Milestone | Focus |
|-----------|--------|
| **M1** | Case Ownership & My Queue |
| **M2** | Operational Prioritization |
| **M3** | Release |

## M1 — Case Ownership & My Queue

回答：

- 这个案件谁负责？
- 哪些案件是我的？
- 哪些案件还没人负责？

### Invariants

1. **Ownership ≠ ACL**  
   `CASE_READ` 仍可查看全部可见案件；assignment 不改变 Case 可见性。

2. **Assignment ≠ HumanReview reviewer**  
   案件负责人与人工研判责任人分离；assignment 不改 Status / SuggestedAssessment / HumanReview / Checklist / Report。

3. **No auto assignment**  
   无 round-robin / load balancing / SLA / due date（属 M2）。

4. **Server-authoritative ownership**  
   SoT = `CaseRecord.assignedToUserId`；禁止写入 `caseState`；指派走 Semantic Command + Audit + stale/CAS。

### Out of scope (M1)

teams / departments / tenant / Case ACL / notifications / priority algorithm / AI / MITRE / Case merge

## M2 — Operational Prioritization & Due Dates

回答：

- 哪些案件已经超期？
- 哪些案件今天要处理？
- 我应该按什么顺序查看自己的案件？

### Invariants

1. **Manual operational deadline**
   SoT = `CaseRecord.dueAt`（nullable）；禁止写入 `caseState`；历史案件保持 `null`（未设置），不按 createdAt/status/risk 自动推算。

2. **Owner-aware editing**
   `CASE_DUE_DATE_WRITE`：VIEWER ✗ / ANALYST ✓ / ADMIN ✓。
   ANALYST 仅可改自己负责的案件；ADMIN 可改任意案件（含未分配）。
   独立 Semantic Command（`setCaseDueAt`），与 Ownership / Status 分离。

3. **Deterministic due-state（非 Priority Score）**
   `NONE | OVERDUE | DUE_TODAY | UPCOMING | CLOSED`；显式传入 `now`；UTC+8 日历日语义。
   CLOSED 即使历史 overdue 也不再显示「已逾期」。
   **禁止** priorityScore / urgencyScore / risk×checklist×age 综合评分。

4. **Deadline-first optional sorting**
   `?sort=recent`（默认）| `?sort=due`；可与 scope/q/status/risk 组合。
   due 桶序：open OVERDUE → DUE_TODAY → UPCOMING → no due → CLOSED；同桶 dueAt ASC，再 lastActivityAt DESC、caseNumber ASC。

5. **No SLA / automatic escalation**
   dueAt ≠ 安全事件时间 / 合规期限 / SLA breach；OVERDUE ≠ HIGH risk / incident / CaseStatus escalation。

### Out of scope (M2)

priority score / SLA policy / auto due date / escalation / notification / email / workload balancing / round-robin / team queue / department / tenant / Case ACL / calendar / recurring task / automatic CaseStatus or risk change / AI
