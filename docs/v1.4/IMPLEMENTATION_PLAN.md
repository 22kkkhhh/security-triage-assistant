# v1.4 实施计划（设计后拆分）

> 基于当前仓库（v1.3.0）真实边界优化顺序。  
> 原则：**先闭环，后扩量；先 Control，后灌规则；先只读知识，后写回 Case/Report。**

---

## 0. 已锁定决策（实现不得推翻）

1. 先做 Knowledge Center 闭环，不先批量导入开源规则  
2. 保留 ComplianceControl 中间层  
3. v1.4.0 AI 非核心依赖  
4. 小范围知识包：3–5 文档 / 20–30 条款 / ~25–30 可运行规则  
5. Findings 第一版 computed；Report 用 snapshot  
6. Checklist 仅 opt-in  
7. 继续 SQLite 建 Knowledge schema（可前向迁 PostgreSQL）  
8. 无 Knowledge Admin UI；无通用 PDF 解析器  

---

## Step 1 — Knowledge Domain & Schema

**目标：** 落地 candidate schema 的最小 Prisma 模型 + Domain types + Permissions。

- Document / Version（含 `versionKey`）/ Clause / Control  
- `SecurityRuleMetadata` Domain type（无 DB 表；executable SoT 仍为 TS）  
- RuleControlMapping / ControlClauseMapping  
- `CaseComplianceFinding` / `ComplianceReferenceSnapshot`（纯 Domain）  
- `KNOWLEDGE_READ`  
- 权利门禁、日期窗口、历史选版、missing-context helpers  
- 最小 Knowledge Repository（upsert，服务 Step 2）  

**设计修正：** `INSUFFICIENT_CONTEXT` 仅在 Case runtime relevance，不在静态 Mapping。

**不做：** UI、真实法规导入、规则扩写、Checklist/Report 集成。

**出口：** migrate `add_security_compliance_knowledge` + unit/persistence/forward tests。

---

## Step 2 — Curated Knowledge Pack + Import

### Step 2A（进行中/本提交）

**目标：** 受控 pack + 幂等 importer + seed。

- 5 文档（CSL / DSL / PIPL / NDSL 条例 / GB/T 22239）  
- ~20–30 精选条款；GB/T **SUMMARY_ONLY**  
- Controls + RuleControl + ControlClause mappings（APPROVED）  
- `docs/law/SOURCES.md` 溯源；PDF 不入库  
- `importCuratedKnowledgePack` + `db:seed`  

**不做：** UI、RAG、Admin、爬虫、SecurityRule 表、改 Step 1 schema。

**出口：** pack 校验 + 幂等导入测试；seed twice；Case A/B audit 不变。

---

## Step 3 — Knowledge Center Read UI（**延期至 v1.4.1+**）

**目标：** `/knowledge` 列表 + 文档/条款阅读。

- 搜索/过滤  
- 原文 vs 解读分区  
- 版本信息与法律状态展示  

**不做：** Case panel、Report 章节。

**出口：** 三角色可读；未登录拒绝。

**v1.4.0 说明：** 未实现独立浏览 UI；Case 面板 + Report Snapshot 已覆盖研判主路径。

---

## Step 2B — Runtime Compliance Resolution（已完成）

**目标：** Case 运行时从命中 ruleId 解析 Findings + Snapshot（不建表、不接报告 UI）。

- 复用 `selectApplicableVersionAt` / `selectCurrentApplicableVersion`  
- 仅 ABNORMAL / UNKNOWN 命中规则；不反推新事件  
- relevance 保守：SUPPORT→RELEVANT，POSSIBLE_OBLIGATION→POSSIBLE，缺上下文→INSUFFICIENT_CONTEXT；第一版不自动 DIRECT  
- control+clause 去重，保留 supportingRuleIds / evidenceIds  
- Snapshot 固定 caseDate / VersionSelectionBasis / versionKey / clauseKey  

**出口：** `resolveCaseCompliance` + 历史选版 / 去重 / Case A/B 测试。

---

## Step 2C — Report Integration（本提交）

**目标：** Snapshot → 报告三节 + DOCX；创建草稿时固化，导出不再查 Knowledge。

- 章节：相关合规参考 / 可能相关要求 / 建议进一步核实事项  
- 禁止违法/违规/法律意见自动措辞；GB/T SUMMARY_ONLY 摘要渲染  
- `createReportDraftCommand` 解析 Snapshot 后写入 `ReportData.complianceReferences`  

**不做：** Prisma schema、SecurityRule SoT、RAG/Admin UI。

**出口：** compliance report builder 测试 + Case A/B DOCX + samples。

---

## Step 4 — Case UI：Compliance Reference Panel（本提交）

**目标：** Case 详情页只读展示后端已解析的合规参考（复用 Step 2B `selectTopFindingsByRelevance`，Top-N=8）。

- 分组：相关合规参考 / 可能相关要求 / 需补充上下文  
- 空分组不渲染；全空简洁空态  
- GB/T 标注「标准要求摘要/控制参考」；ruleId 仅展开审计区可见  
- 前端不重跑 Rule→Control→Clause，不扩 pack / Prisma  

**不做：** 自动写 Checklist、法规搜索、编辑入口、原文锚点跳转（Step 5/6）。

**出口：** CaseCompliancePanel + Case A/B 分组测试。

---

## Step 5 — Compliance Verification Checklist（本提交）

**目标：** 基于 Step 2B findings 的 ContextRequirement / EvidenceSuggestion / ChecklistSuggestion，在 Case 详情页展示只读「建议核查事项」。

- 稳定 key 去重 + provenance；INSUFFICIENT_CONTEXT 优先  
- 分组：待确认信息 / 建议收集证据 / 建议核查动作  
- Top-N=8 分层选取；不写 Prisma ChecklistItem、不勾选保存  

**不做：** 自动写入核查清单、原文锚点跳转、扩 pack。

**出口：** CaseComplianceChecklistPanel + Case A/B 聚合测试。

---

## Step 6 — Compliance Suggestions → Case ChecklistItem（本提交）

**目标：** 将 Step 5 建议项 opt-in 写入现有 Case ChecklistItem（无第二套状态机 / 无新表）。

- `origin=MANUAL` + `sourceKind=KNOWLEDGE_SUGGESTED` + `sourceRef`（caseState JSON，无 Prisma migration）  
- 同一 Case + suggestionKey 幂等；复用 `CHECKLIST_WRITE` / `applyChecklistCommand`  
- Knowledge 重算不删除/修改已加入项  

**不做：** 自动批量加入、扩 pack、RAG/Admin UI。

**出口：** CaseComplianceChecklistPanel「加入核查清单」+ 幂等/merge 测试。

---

## Step 7 — Compliance Source & Clause Navigation（本提交）

**目标：** Case 合规参考展开区提供官方来源导航（可核验），不引入搜索/RAG/PDF viewer。

- URL 来自 pack/persisted `sourceUrl`；http(s)+批准域名校验  
- 无稳定条款锚点时只跳官方文档页；SUMMARY_ONLY/GB/T 不提供「查看原文条款」  
- 展示 issuingAuthority / canonicalCode / version / effectiveDate  

**不做：** 法规全文搜索、内嵌 PDF、抓取官网、Admin 编辑来源、Prisma migration。

**出口：** complianceSourceNavigation + CaseCompliancePanel 来源区测试。

---

## Step 7b — Report Integration（已在 Step 2C 完成）

**目标：** Report 章节 + ComplianceReferenceSnapshot（历史）。

- createReportDraft 写入快照；DOCX 章节 + 免责声明  
- 知识库变更不改已导出/已存草稿快照

---

## Step 8 — Rule Library Expansion（**延期至 v1.4.1+**）

**目标：** 可运行规则扩至约 25–30。

- Gap analysis：SUPPORTED / NEEDS_CONTEXT / OUT_OF_SCOPE  
- 仅落地 SUPPORTED + 有测试  
- 外部来源补 provenance/license  

**不做：** Sigma runtime；为数量而数量。

**出口：** 规则单测 + 与 Control 映射更新。

**v1.4.0 说明：** executable 规则仍为 11 条（`allRules`）；pack 已为现有规则建立 Control 映射。

---

## Step 9 — Hardening / v1.4 Release（**本冻结完成**）

**目标：** 全量回归、文档宣称、demo 路径、tag 准备。

- v1.3 安全回归  
- Case A/B 语义  
- 无法律结论文案扫描  
- Release Gate → [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md)  

---

## 顺序优化说明

相对「先扩规则再做知识」的诱惑：

- 本仓库痛点是**研判可解释与报告引用**，不是检测覆盖率  
- 无 Control/Clause 时扩规则只会制造更多无法落地的 `verificationActions` 文本  
- 因此 **Step 2–5 优先于 Step 8**

若进度紧张：Step 8 可缩到「+5 条强相关 SUPPORTED 规则」，其余放 v1.4.1。

---

## Deferred（明确不进 v1.4.0）

- Knowledge Admin UI / SystemAuditLog  
- 内部制度上传解析 / OCR  
- Vector search / RAG / 外部 AI  
- Policy ACL / Case ACL  
- PostgreSQL 强制迁移  
- Findings 永久持久化表（除非性能实证需要）  
- PDF 嵌入阅读器作为主路径  

---

## 建议分支策略

- 设计：`feat/v1.4-security-compliance-knowledge`（本 Step）  
- 实现：按 Step 从 `v1.3.0` 继续或自本设计分支拉出，**禁止改写 v1.3.0 tag**  
