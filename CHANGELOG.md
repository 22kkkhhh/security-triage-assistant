# Changelog

本项目采用轻量变更记录。版本号遵循语义化约定；未打正式 tag 的条目以 `-rc` 标记。

## v1.12.0 — 2026-08-11

Theme: Deployment & Production Readiness

### Added

- Production startup gate with migrate-before-start
- Liveness and readiness endpoints
- Production environment and HTTPS validation
- Security response headers
- Single-node login rate limiting
- Production Docker image and persistent data contract
- Verified SQLite backup and restore commands
- Minimal structured operational events
- Docker CI smoke

### Safety / Operations

- Restore requires explicit confirmation and stopped application
- Restore rejects corrupt backup before replacement
- Restore fails closed when stale SQLite sidecars cannot be cleared
- Docker uses readiness rather than liveness-only health
- Runtime secrets are injected, not baked into image

### Boundaries

- Single-node SQLite
- No HA/multi-replica
- No PostgreSQL migration
- No distributed rate limiting
- No Kubernetes/Redis/OTel platform

## v1.11.0 — 2026-08-11

Theme: Case Operations

### Added

- Persistent Case ownership
- Analyst self-claim / release
- Admin Case assignment
- My / Unassigned queue scopes
- Persistent operational due dates
- Overdue / due-today / upcoming states
- Deterministic deadline-first queue sorting
- Assignment and due-date Audit events

### Safety / Semantics

- Ownership does not change Case visibility or ACL
- Case owner is distinct from HumanReview reviewer
- Due date is operational metadata, not security risk or SLA
- No automatic priority score
- No automatic assignment or escalation

### Technical

- Two Prisma migrations: `add_case_ownership`, `add_case_due_at`
- Two new coarse-grained permissions: `CASE_ASSIGN`, `CASE_DUE_DATE_WRITE`
- No dependency changes

### Deferred / Known Limitations

- Teams / departments / multi-tenant / Case ACL
- Workload balancing / round-robin assignment
- Pagination-aware DB-level due sorting
- SLA policies / escalation / notifications / email / calendar integration
- Priority scoring / AI

## v1.10.0 — 2026-08-11

Theme: Human-centered UX

### Added / Changed

- Human-centered Case Workbench information architecture
- Four-section navigation: Overview / Investigation / Analysis / Records
- Task-first investigation flow and progressive disclosure
- Simplified responsive Case List
- Case List risk labels distinguish human vs system suggestion
- Three-step Case creation / alert intake presentation
- Responsive Case Comparison
- Document-style report editing experience
- Shared PageFrame / PageHeader presentation consistency

### Semantics

- UI-only / presentation-focused release
- No change to analysis, correlation, risk or HumanReview semantics
- System suggestions remain distinct from human decisions
- No schema migration or new permissions

### Deferred / Known Limitations

- Dark Mode / theme system / design-system package
- Charts / dashboard
- Richer record filtering / saved UI preferences / drag-drop
- New security capabilities / AI / LLM

## v1.9.0 — 2026-08-11

Theme: Comparative Investigation

Added:
- two-case Comparative Investigation workspace
- deterministic shared/different fact comparison
- historical/current judgment separation
- Investigation Lead analyst opt-in
- persisted Checklist provenance（`sourceKind=INVESTIGATION_LEAD`）
- semantic dedup + Audit（复用既有 Checklist Semantic Command）

Safety:
- comparison is read-only
- related ≠ same incident
- leads require analyst opt-in
- historical judgment/risk is not inherited
- no automatic risk/status/HumanReview changes

Deferred / Known Limitations:
- Case merge / incident graph / attack chain / timeline merge / report comparison
- MITRE ATT&CK / threat intelligence / IOC reputation
- AI / LLM / embeddings / vector DB / probability scoring
- automatic risk escalation / automatic checklist creation
- assignment / owner / due date / notifications / SLA

## v1.8.0 — 2026-08-11

Theme: Investigation Intelligence（历史关联 + 调查线索）

Added:
- Related Historical Cases：基于明确共同调查事实的确定性关联（username / source IP / shared system / external alert ID）
- `SAME_ALERT_SOURCE` 仅作附加 reason，不得单独建立关联
- 服务端 30 天窗口、最多 5 条结果；排除当前 Case；null/空串不匹配
- Historical Signals：`RECURRING_USERNAME` / `RECURRING_SOURCE_IP` / `RECURRING_SYSTEM` / `REPEATED_EXTERNAL_ALERT_ID`
- Investigation Leads：确定性「建议核查」提示（最多 4；不落库、非 Checklist）
- Workbench「历史调查线索」区 + 导航「历史线索」（只读辅助）

Safety / Semantics:
- 无 AI / 概率相关分；关联 ≠ 同一安全事件
- 历史风险与 HumanReview 不改写当前 Case
- Investigation Lead ≠ 安全结论；≠ 自动写入 Checklist
- **无 Prisma schema migration**

Deferred / Known Limitations:
- Case merge / incident graph / attack chain
- MITRE ATT&CK / threat intelligence / IOC reputation
- LLM / embeddings / vector DB / clustering / probability scoring
- automatic risk escalation / auto checklist generation
- cross-tenant / Case ACL

## v1.7.0 — 2026-08-10

Theme: Alert Intake & Investigation Workbench

Added:
- Generic single-alert JSON intake（ConfirmationPanel → 人工确认建案）
- Wazuh JSON adapter：确定性字段映射 + 内部 severity 摄入策略（非官方等价标准）
- External alert provenance；Golden Case 规则基线
- 更安全的 UNKNOWN 处理与业务上下文风险聚合
- Case Investigation Workbench 刷新（概览 / 下一步 / 证据与核查工作区）

Deferred / Known Limitations:
- webhook / streaming / batch / JSONL ingest
- externalAlertId dedup / raw JSON persistence
- Wazuh API 直连 / ML baseline / Context Model v2

## v1.6.0 — 2026-08-10

Theme: Operational Readiness / Demo Reliability

Added:
- Critical E2E：Analyst 调查流、Report/DOCX、Viewer 只读、fail-closed 解析失败路径
- Demo/UI：Checklist 展示分组、合规技术详情折叠、案件首屏工作流优先级调整（不改安全语义）
- 同请求重复 full analyze 收敛（Case detail / Report create / Business Context next-state：2→1）
- 无全局 cache / 跨请求 memo / 陈旧安全结果复用

Deferred / Known Limitations:
- Context Model v2 / PostgreSQL migration / schema 扩容
- external AI/API / runtime Agent

## v1.5.0 — 2026-08-10

Theme: Case Investigation Context / Progress / Hardening

Added:
- Case Investigation Context 与 Investigation Progress（服务端投影；fail-closed）
- Security Evidence 稳定 identity / provenance；Compliance runtime 解析
- Auth/RBAC 与 operation ownership 加固；Production environment hardening
- Semantic Command minimal intent / server canonicalization
- Snapshot autosave single-flight；Report autosave race 修复
- Frozen compliance reference snapshot 保持可重现

Deferred / Known Limitations:
- SYSTEM checklist 展示分组（后续在 v1.6 完成）
- duplicate analyze 性能（后续在 v1.6 完成）
- 完整 WCAG / CONTEXT_MODEL_GAPS 持久化扩展 / PostgreSQL migration

## v1.4.0 — 2026-08-10

Added（Case 集成合规知识切片）:
- Knowledge additive schema：Document / Version / Clause / Control / RuleControlMapping / ControlClauseMapping
- Curated Knowledge Pack（5 文档 / 26 条款 / GB/T 22239 SUMMARY_ONLY）+ 幂等 seed 导入
- Case 运行时 Rule→Control→Clause 解析（Findings + `ComplianceReferenceSnapshot`；无 Finding 表）
- 报告创建时固化 Snapshot；DOCX「法规与制度关联」三节 + 免责声明
- Case UI：合规参考面板、建议核查清单、opt-in 写入现有 ChecklistItem（`KNOWLEDGE_SUGGESTED`）
- 官方来源导航：provenance URL + 域名 allowlist；SUMMARY_ONLY 不提供原文条款假入口
- `KNOWLEDGE_READ` Permission（三角色可读）

Deferred / Known Limitations:
- 无独立 Knowledge Center 浏览 UI（原 Step 3）
- 可执行规则仍为 11 条（原 Step 8 扩量延期）
- 无 RAG / 法规搜索 / PDF viewer / Knowledge Admin / SystemAuditLog
- 继承 v1.3 Known Limitations（无 Case ACL / MFA / SSO 等）

## v1.3.0 — 2026-08-09

Added:
- 身份认证（username + password）与 Database Session（Better Auth 1.6.26）
- ADMIN / ANALYST / VIEWER 三角色与 Server-side Permission 强制
- Trusted USER Case Audit Actor；operationId 跨用户重放保护
- HumanReview 责任人绑定 authenticated identity（`reviewer` 快照 + `reviewedByUserId`）
- VIEWER 只读 UI（capability 呈现；Server Authorization 为最终边界）
- ADMIN 最小用户管理；自助改密；ADMIN 重置密码；Session 吊销
- last enabled ADMIN invariant；Production `user:bootstrap-admin`
- Case Snapshot write boundary hardening（Autosave allowlist）

Known Limitations（非本版本缺陷声明）：
- 无 Case Ownership / Case ACL；单实例 authenticated users 可查看全部 Case
- 无 MFA / SSO / SystemAuditLog / Login·UserAdmin·Password 全局审计
- SQLite 本地持久化；username/email 创建后不可改；无首次强制改密 / forgot-password
- UI capability 可能 stale；Legacy MANUAL Audit 与无 `reviewedByUserId` 的 reviewer 保留
- 不等于 Enterprise IAM、电子签名、防篡改合规审计或 SIEM 替代

## v1.2.1

Fixed:
- UNKNOWN observation 不再在内部携带 LOW 风险语义（`riskLevel` 为 `null`）
- 对齐 README 正式版本表述与 ARCHITECTURE 技术栈（去除未使用的 Zod / shadcn 声称）

## v1.2.0

- CaseAuditLog 操作审计（与 Timeline 分离）
- Semantic Command + Prisma 事务写入业务状态与 Audit
- Snapshot Autosave 不产生 Audit
- operationId 幂等、stale 防覆盖
- Activity Feed / 最新交接 / lastActivityAt
- 报告创建 / 更新（会话首次）/ 导出审计
- Demo Seed 幂等 Audit（Case A / Case B）

## v1.1.0

- 案件持久化与历史案件列表
- 报告草稿持久化与 DOCX 导出
- Case A / Case B Demo Seed
