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

## Step 3 — Knowledge Center Read UI

**目标：** `/knowledge` 列表 + 文档/条款阅读。

- 搜索/过滤  
- 原文 vs 解读分区  
- 版本信息与法律状态展示  

**不做：** Case panel、Report 章节。

**出口：** 三角色可读；未登录拒绝。

---

## Step 2B — Runtime Compliance Resolution（本提交）

**目标：** Case 运行时从命中 ruleId 解析 Findings + Snapshot（不建表、不接报告 UI）。

- 复用 `selectApplicableVersionAt` / `selectCurrentApplicableVersion`  
- 仅 ABNORMAL / UNKNOWN 命中规则；不反推新事件  
- relevance 保守：SUPPORT→RELEVANT，POSSIBLE_OBLIGATION→POSSIBLE，缺上下文→INSUFFICIENT_CONTEXT；第一版不自动 DIRECT  
- control+clause 去重，保留 supportingRuleIds / evidenceIds  
- Snapshot 固定 caseDate / VersionSelectionBasis / versionKey / clauseKey  

**不做：** Prisma schema 变更、Finding 表、报告集成、RAG/Admin UI。

**出口：** `resolveCaseCompliance` + 历史选版 / 去重 / Case A/B 测试。

---

## Step 4 — Compliance Relevance Engine（后续增强）

**目标：** 在 Step 2B 基础上增强排序截断、Case UI Top-N 策略与更细 evidence 绑定。

**不做：** 自动写 Checklist。

**出口：** Case B 稳定 3–6 findings（UI 展示断言）。

---

## Step 5 — Case-aware Compliance Panel

**目标：** 工作台「法规与制度关联」UI。

- 展示 findings  
- 跳转 Knowledge 原文锚点  
- Disclaimer  

**不做：** Report 快照（可预留选择态）。

**出口：** VIEWER 只读；ANALYST 可见建议但不自动写入。

---

## Step 6 — Checklist / Evidence Suggestions (Opt-in)

**目标：** 「加入核查清单」Server Action。

- 去重 + operationId  
- 来源 metadata  
- 建议证据只展示  

**不做：** 自动批量添加。

**出口：** 确认后写入；取消则 Case 不变。

---

## Step 7 — Report Integration

**目标：** Report 章节 + ComplianceReferenceSnapshot。

- createReportDraft 写入快照  
- 旧报告兼容  
- DOCX 章节 + 免责声明  

**不做：** 自动刷新已有草稿。

**出口：** 知识库变更不改已导出/已存草稿快照。

---

## Step 8 — Rule Library Expansion

**目标：** 可运行规则扩至约 25–30。

- Gap analysis：SUPPORTED / NEEDS_CONTEXT / OUT_OF_SCOPE  
- 仅落地 SUPPORTED + 有测试  
- 外部来源补 provenance/license  

**不做：** Sigma runtime；为数量而数量。

**出口：** 规则单测 + 与 Control 映射更新。

---

## Step 9 — Hardening / v1.4 Release

**目标：** 全量回归、文档宣称、demo 路径、tag 准备。

- v1.3 安全回归  
- Case A/B 语义  
- 无法律结论文案扫描  
- Release Gate  

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
