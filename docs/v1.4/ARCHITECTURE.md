# v1.4 架构设计：安全与合规知识中心

> 状态：Design Locked（Step 0）  
> 候选架构，不授权 Prisma migration。

---

## 1. 设计目标

在不破坏 v1.3 Auth / Snapshot / Audit / Report 边界的前提下，增加一条**可解释的合规知识链路**：

```text
Executable Security Rules (code)
        │ AnalysisResult
        ▼
ComplianceControl (stable product vocabulary)
        │
        ▼
ComplianceClause @ DocumentVersion
        │
        ▼
CaseComplianceFinding (computed)
        │
        ├─ Missing Context
        ├─ Suggested Evidence
        └─ Suggested Checklist (opt-in)
                │
                ▼
Human Review → Report ComplianceReferenceSnapshot
```

---

## 2. 核心实体关系

```text
ComplianceDocument 1──* ComplianceDocumentVersion
ComplianceDocumentVersion 1──* ComplianceClause
ComplianceClause *──1 ComplianceClause? (parentClauseId)

ComplianceControl
SecurityRuleMetadata (catalog; executable logic stays in TS)

SecurityRuleMetadata *──* ComplianceControl   via RuleControlMapping
ComplianceControl *──* ComplianceClause       via ControlClauseMapping

Case (existing)
  └─ computed CaseComplianceFinding[]
ReportDraft (existing)
  └─ optional complianceReferences: ComplianceReferenceSnapshot[]
```

**禁止唯一主路径：** `RuleId → ClauseId`  
允许未来只读快捷索引，但 **SoT 映射必须经 Control**。

---

## 3. Rule 执行策略（关键锁定）

| 层 | 职责 |
| --- | --- |
| Executable Rules | 继续 `src/services/analysis/rules/*` 纯 TS；不引入 DB DSL / Sigma runtime |
| SecurityRuleMetadata | 目录元数据：能力状态、来源、许可、requiredFields |
| AnalysisResult | 仍为现有领域输出；v1.4 消费其 `ruleId/status/evidenceIds/...` |

**source = provenance，不是 engine。**  
`sourceType=SIGMA` 只表示 adapted-from，不表示执行 Sigma YAML。

---

## 4. Case Relevance Flow

```text
1. 读取 Case：AnalysisResult[] + Context + BusinessContext + HumanReview?
2. 解析 CaseRelevantDate：
   - 优先 alert/incident occurrence time（Normalized Context）
   - 缺失则 fallback「当前有效版本」并标记 basedOnCurrentEffectiveVersion=true
3. 对每个 ABNORMAL / 关键 UNKNOWN AnalysisResult：
   - 查 RuleControlMapping → Controls
   - 查 ControlClauseMapping → Clauses（限定 DocumentVersion 对 CaseRelevantDate 有效）
4. 计算 relevance + rationale + missingContext + suggestions
5. 排序截断：默认 Top N（建议 6，可配置）供 Case UI
```

**Live Knowledge：** Case 页每次打开可重算（computed view）。  
**Historical Snapshot：** 仅 Report 固化。

---

## 5. Missing Context Flow

规则/控制项声明 `requiredContext[]`（字段键，对齐 Normalized Context / BusinessContext）。

计算：

```text
missing = required − present(non-null / non-UNKNOWN where applicable)
```

若目标义务（如「数据出境」）依赖缺失字段（destinationRegion 等）：

- relation / relevance → `INSUFFICIENT_CONTEXT`
- **不得**升级为出境/泄露/违法结论

---

## 6. Checklist Suggestion Flow

```text
Finding.suggestedChecklist[]
  → UI 展示（未写入 Case）
  → 用户点击「加入核查清单」
  → Server Action（需写权限）
  → 去重 + operationId
  → ChecklistItem（origin 仍 MANUAL；metadata.source = KNOWLEDGE）
```

**禁止**规则命中自动批量写入。

idempotency 建议键：

`(caseId, controlId|clauseId, checklistLabelFingerprint)`

---

## 7. Report Snapshot Flow

```text
createReportDraft
  → 收集 Case 当前 selected findings（默认 Top relevant，可取消勾选）
  → 写入 ReportDraft.complianceReferences[] 快照字段
  → 之后知识库变更不影响该草稿
```

刷新关联：**仅**用户显式「刷新法规关联」+ 确认后覆盖（v1.4.0 可只做创建时写入，刷新延后）。

旧 Report：`complianceReferences` 缺失 → 章节隐藏/空态，加载不失败。

---

## 8. Version Selection by Case Date

对每个 Document：

1. 候选 Versions：`publicationStatus=PUBLISHED`  
2. 过滤 `legalStatus` 与日期窗口：  
   `effectiveDate <= caseRelevantDate` 且 `(expiryDate == null || caseRelevantDate < expiryDate)`  
3. 若多条：取 effectiveDate 最新  
4. 若无匹配且 case date 缺失：取当前 EFFECTIVE + PUBLISHED，并标记  
5. SUPERSEDED / REPEALED 版本可被历史 Case 选中，但 UI 标注法律状态

---

## 9. Knowledge Read Path（权限）

```text
requirePermission(KNOWLEDGE_READ)  // 建议三角色均有
→ list/get documents, versions, clauses
→ compute findings (read-only)
```

写入知识：**v1.4.0 无 UI**；仅 CLI/seed（运维边界，非产品 Admin）。

加入 Checklist / 生成 Report 引用：沿用现有 CASE/REPORT 写权限。

---

## 10. 与现有四维模型的关系

| 概念 | 含义 |
| --- | --- |
| SecurityDomain（DATA/NETWORK/IDENTITY/BUSINESS） | Case 分析维度（现有） |
| ComplianceControl.domain | 控制项领域（可更细：GOVERNANCE/PRIVACY/INCIDENT_RESPONSE…） |

二者**相关但不同**。  
Mapping 允许跨维（例如 NETWORK 规则 → DATA 控制项「跨境传输」），但必须经 Missing Context 门禁。

---

## 11. 存储与运行时拓扑（v1.4）

```text
Next.js App Router
  /knowledge/*          Server Components + requirePermission
  Case Compliance Panel Client UX + Server Actions（仅 opt-in checklist / report）
Knowledge Services
  knowledgeQuery
  complianceRelevanceEngine（纯函数优先，便于测）
  knowledgePackImporter（CLI）
Prisma + SQLite（v1.4 推荐继续）
  structured documents/clauses/mappings
Optional file refs（未来 binary）
  不把大 PDF 塞进 SQLite blob
```

外部 AI：架构预留 `suggestionProvider` 接口；**默认 Noop**，不得出现在核心引擎依赖中。

---

## 12. 导入生命周期（预留，不实现）

```text
UPLOAD → PARSE → DRAFT → REVIEW → PUBLISH
```

v1.4.0 只走：

```text
Curated Pack → Import Script → PUBLISHED rows
```

---

## 13. 安全含义

- 公开法规：低敏；三角色可读可接受  
- 内部制度：模型支持 `INTERNAL_POLICY`，但 v1.4.0 若纳入必须视为全员可读产品选择；**Policy ACL 不做**  
- 权利不允许时：`contentMode=METADATA_ONLY|SUMMARY_ONLY`，禁止打包 `originalText` 全文  

---

## 14. 审计决策

| 行为 | Audit |
| --- | --- |
| 阅读法规 | 不写 CaseAuditLog |
| Knowledge Admin（未来） | 需要 SystemAuditLog → **deferred**，不在 v1.4 硬塞 CaseAuditLog |
| 加入 Checklist / 报告引用 | 沿用现有 Case/Report Audit 语义 |

---

## 15. 过度设计风险（架构层）

| 风险 | 决策 |
| --- | --- |
| 完整法律知识图谱 | 不做；parentClauseId + sortOrder 足够 |
| 持久化所有 Finding | 第一版 computed；避免与 Live knowledge 双写 |
| 动态 Rule Engine | 不做 |
| Vector RAG | 不做 |
| 过早 PostgreSQL | **不阻塞**；v1.4 SQLite + 规范 migration 命名即可 |

## 16. 必须现在锁定（否则迁移痛苦）

1. Control 中间层  
2. publicationStatus ≠ legalStatus  
3. rights/contentMode 门禁  
4. originalText ≠ summary/interpretation  
5. Report snapshot ≠ live findings  
6. CaseRelevantDate 版本选择  
7. 关系枚举禁止 VIOLATED/ILLEGAL  
8. Executable rules 不进 DB DSL  
