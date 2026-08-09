# v1.4 Release Acceptance Checklist

**主题：** Security Compliance Knowledge（Case 集成切片）  
**基线：** `v1.3.0` (`7f61fbc`)  
**冻结 HEAD：** `f886387751b3d225750177ad128cf19643d0874a`（`chore: harden v1.4 release`）  
**范围声明：** v1.4.0 交付 **Case 侧合规知识闭环**（Schema / Pack / Resolve / Report Snapshot / Case UI / Checklist opt-in / Official Source Navigation）。  
**明确延期：** Step 3 独立 Knowledge Center 浏览 UI；Step 8 可执行规则扩量至 25–30。

---

## 1. Schema / Migration（v1.3.0 → HEAD）

| 检查项 | 结果 |
| --- | --- |
| 仅一条 Knowledge additive migration：`20260809150332_add_security_compliance_knowledge` | PASS |
| 新增表仅：`ComplianceDocument` / `ComplianceDocumentVersion` / `ComplianceClause` / `ComplianceControl` / `RuleControlMapping` / `ControlClauseMapping` | PASS |
| **无** Finding / Snapshot Prisma 表 | PASS |
| **无** SecurityRule Prisma 表；executable SoT 仍为 `src/services/analysis/runRules.ts` → `allRules`（当前 11 条） | PASS |
| `INSUFFICIENT_CONTEXT` 仅 runtime Case relevance（Domain / resolve），不入静态 Mapping 枚举 | PASS |
| Auth / Case / Audit 表无破坏性变更 | PASS |

---

## 2. Runtime / 产品边界

| 检查项 | 结果 |
| --- | --- |
| 报告创建时 `resolveComplianceSnapshotsForReport` 一次解析；`buildReportData` / 导出只消费 `ReportData.complianceReferences` frozen Snapshot | PASS |
| 报告更新 / autosave / GET 报告页 **不** 重新查 Knowledge | PASS |
| Case UI Client（`CaseCompliancePanel` 等）仅消费 DTO；**不** import Prisma / `resolveCaseCompliance` | PASS |
| 服务端 `loadCaseComplianceWorkbenchViews` 负责 resolve | PASS |
| Checklist 建议写入复用现有 `ChecklistItem` + `CHECKLIST_WRITE` + `applyChecklistCommand` + CaseAudit；`sourceKind=KNOWLEDGE_SUGGESTED` | PASS |
| **无** 自动批量写入 Checklist 路径 | PASS |
| 官方 source URL 仅 pack/persisted provenance + allowlist（`complianceSourceNavigation`）；UI **无** 硬编码法规 URL | PASS |
| GB/T 22239 `contentMode=SUMMARY_ONLY`；条款 `originalText=null`；不提供「查看原文条款」假入口 | PASS |
| 本地 `docs/law/*.pdf` gitignore；不作为用户侧 canonical source | PASS |
| tracked PDF / git history：无 `*.pdf` | PASS |

### 禁止措辞扫描（产品输出路径）

扫描目标：`已违法` / `违反某法` / `已违规` / `法律责任成立` / `合规结论：不合规`

| 位置 | 结果 |
| --- | --- |
| UI / Report builder 输出路径 | 仅出现在 **禁止正则** 与 pack **否定免责**（「不得…认定已违法」） |
| 自动结论文案路径 | 不存在 |

---

## 3. Migration / Seed Gates

| 检查项 | 结果 |
| --- | --- |
| Fresh DB：`prisma migrate deploy`（5 migrations 全量） | PASS |
| Fresh seed ×2 幂等：Case A Audit=6、Case B Audit=4；Knowledge counts 稳定（5/5/26/10/17/31） | PASS |
| v1.3.0 → knowledge migration forward（`knowledgePersistence` 测试）保留 Case/Auth/Audit | PASS |
| Case A 报告合规章节 seed 刷新：snapshots=12 | PASS |

---

## 4. Case A / B E2E 摘要（自动化覆盖）

| 步骤 | Case A | Case B |
| --- | --- | --- |
| analyze | 业务授权场景，规则结果可复现 | 待核查场景，规则结果可复现 |
| compliance resolve | Findings + Snapshot；含 POSSIBLE / INSUFFICIENT_CONTEXT（分层 Top-N） | 稳定相关条款；无自动违法语义 |
| snapshot → report | 创建草稿固化 `complianceReferences`；DOCX 含三节 + 免责 | 同左（samples 生成） |
| Case UI panel | Top-N=8；分组/空态/展开审计 | 同左 |
| checklist suggestion add | opt-in；suggestionKey 幂等；audit | 同左 |
| source navigation | provenance URL + allowlist；无 source 空态 | 同左；GB/T 仅文档页 |

---

## 5. RBAC 摘要

| Role | 合规相关 |
| --- | --- |
| VIEWER | `KNOWLEDGE_READ` + Case/Report 只读；**无** `CHECKLIST_WRITE` / `REPORT_WRITE` |
| ANALYST | 继承读；可 Checklist 建议写入、报告创建/导出 |
| ADMIN | 继承 ANALYST；另含 User Admin |

Server Authorization 仍为最终边界；UI capability 不构成安全边界。  
v1.4 **未** 引入 Knowledge Admin / SystemAuditLog。

---

## 6. 质量门禁（本冻结执行）

| Gate | 结果 |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS（44 files / **450** tests） |
| `npm run build` | PASS |
| `prisma format` / `validate` / `generate` | PASS |
| `npm run generate:samples` | PASS（Case A/B DOCX + 合规章节检查） |

---

## 7. Known Limitations（v1.4.0 不得过度宣称）

- 无独立 `/knowledge` 浏览 UI（Step 3 延期）
- 可执行规则仍为 **11** 条（Step 8 延期；非 25–30）
- Findings / Snapshot **不** 持久化为独立表；Report 依赖草稿内 frozen JSON
- 无法规全文搜索 / RAG / 外部 AI / 内嵌 PDF viewer / Admin 编辑来源
- 官方链接多为文档级公开页；无稳定条款锚点时不伪造 hash
- 继承 v1.3 Known Limitations（无 Case ACL / MFA / SystemAuditLog 等）

---

## 8. Tag 建议

- **建议：** 在本冻结 commit 上打 annotated tag **`v1.4.0`**
- **前提：** CHANGELOG / README 写明「Case 集成切片」与上述延期项
- **不建议：** 在未更新宣称的情况下把 v1.4.0 描述成完整 Knowledge Center 产品

---

## 9. Blocker

**无。**
