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
