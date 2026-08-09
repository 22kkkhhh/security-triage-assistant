# v1.4 数据模型（Candidate Schema）

> **候选模型**，非最终 Prisma migration。  
> Step 0 禁止落地 schema。实现前允许微调字段名，但不得破坏本文锁定的不变量。

---

## 1. 枚举（建议）

### 1.1 DocumentType

```ts
type DocumentType =
  | "LAW"                 // 法律
  | "REGULATION"          // 行政法规
  | "DEPARTMENT_RULE"     // 部门规章 / 规范性文件
  | "STANDARD"            // 国家标准 / 行业标准
  | "GUIDELINE"           // 指南 / 指引
  | "INTERNAL_POLICY";    // 内部制度
```

说明：不用「全部叫 LAW」。标准与内部制度必须可区分（权利与可见性不同）。

### 1.2 PublicationStatus（知识库工作流）

```ts
type PublicationStatus = "DRAFT" | "REVIEWED" | "PUBLISHED";
```

### 1.3 LegalStatus（法律效力）

```ts
type LegalStatus =
  | "NOT_EFFECTIVE"
  | "EFFECTIVE"
  | "SUPERSEDED"
  | "REPEALED";
```

### 1.4 SourceType / RightsStatus / ContentMode

```ts
type KnowledgeSourceType =
  | "OFFICIAL_PUBLIC"
  | "USER_PROVIDED"
  | "LICENSED"
  | "OTHER";

type RightsStatus =
  | "PUBLIC"
  | "USER_AUTHORIZED"
  | "LICENSED"
  | "UNKNOWN";

type ContentMode =
  | "FULL_TEXT"       // 允许存条款原文
  | "SUMMARY_ONLY"    // 仅摘要/结构化要点
  | "METADATA_ONLY";  // 仅元数据与外链
```

**Invariant：** `RightsStatus` 不允许全文时，不得出现 `ContentMode=FULL_TEXT` 的已发布版本；导入器必须 fail closed。

### 1.5 Control Domain

```ts
type ControlDomain =
  | "DATA"
  | "NETWORK"
  | "IDENTITY"
  | "BUSINESS"
  | "GOVERNANCE"
  | "INCIDENT_RESPONSE"
  | "PRIVACY";
```

与 `SecurityDomain`（分析四维）相关但独立。

### 1.6 RuleCapabilityStatus

```ts
type RuleCapabilityStatus =
  | "SUPPORTED"       // 当前 Normalized Context 可真实执行
  | "NEEDS_CONTEXT"   // 规则有价值但缺字段（目录可见，默认不进可执行集）
  | "OUT_OF_SCOPE";   // EDR/Malware/Endpoint 等产品边界外
```

不采用 `REFERENCE_ONLY`（语义弱于 OUT_OF_SCOPE）。

### 1.7 RuleSourceType

```ts
type RuleSourceType =
  | "INTERNAL"
  | "SIGMA"
  | "SPLUNK"
  | "ELASTIC"
  | "OTHER";
```

### 1.8 Control↔Clause 静态 Mapping Relation（选定）

**Step 1 修正：** 静态知识库中的 Control→Clause 关系 **不得** 包含 `INSUFFICIENT_CONTEXT`。  
信息不足属于某个 Case 的运行时状态，不是两个知识实体之间的永久关系。

```ts
/** ControlClauseMapping.relationType — 仅静态知识 */
type ControlClauseRelation =
  | "CONTROL_SUPPORT"        // 支撑某项安全管理控制的核查
  | "POSSIBLE_OBLIGATION"    // 在补齐上下文后可能涉及相关义务
  | "ESCALATION_TRIGGER";    // 达到阈值时应升级人工/流程核查
```

**禁止：** `VIOLATED` / `NON_COMPLIANT` / `ILLEGAL` / `INSUFFICIENT_CONTEXT`（静态 Mapping）。

Rule→Control 使用独立枚举：`PRIMARY` | `SUPPORTING`。

### 1.9 Case Finding Relevance（运行时）

```ts
/** CaseComplianceFinding.relevance — 案件计算层 */
type CaseComplianceRelevance =
  | "DIRECT"
  | "RELEVANT"
  | "POSSIBLE"
  | "INSUFFICIENT_CONTEXT";  // 仅运行时：缺 requiredContext 等
```

静态 Mapping Relation ≠ Case Runtime Relevance。

---

## 2. ComplianceDocument

逻辑文档（跨版本稳定身份）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | cuid |
| canonicalCode | string | 稳定编码，unique，如 `DSL` / `PIPL` |
| title | string | 显示名 |
| documentType | DocumentType | |
| jurisdiction | string | 如 `CN` |
| issuingAuthority | string | 发文机构 |
| description | string? | |
| createdAt / updatedAt | datetime | |

建议索引：`canonicalCode` UNIQUE；`(documentType, title)`。

---

## 3. ComplianceDocumentVersion

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | |
| documentId | FK → Document | |
| versionKey | string | **内部稳定版本键**（Mapping / Snapshot / Import 幂等依赖） |
| versionLabel | string | 展示文案（可缺失/变更，不作技术唯一标识） |
| documentNumber | string? | 文号 |
| publishDate | DateTime? | 公布（日历日语义，UTC 日期部分） |
| effectiveDate | DateTime | 版本开始适用；窗口 `[effectiveDate, expiryDate)` |
| expiryDate | DateTime? | 开始不再适用；须 `effectiveDate < expiryDate` |
| publicationStatus | PublicationStatus | 知识库工作流（DRAFT/REVIEWED/PUBLISHED） |
| legalStatus | LegalStatus | 现实效力；历史选版 **不因 SUPERSEDED 排除** |
| sourceType | KnowledgeSourceType | 与 Rights 分离；OFFICIAL_PUBLIC ≠ 可任意再分发 |
| rightsStatus | RightsStatus | |
| contentMode | ContentMode | `UNKNOWN` rights **禁止** `FULL_TEXT` |
| sourceUrl | string? | 官方来源 |
| sourceFileName | string? | 可选本地文件名（不入库 binary） |
| sourceFileHash | string? | sha256 |
| createdAt / updatedAt | datetime | |
| reviewedAt / publishedAt | datetime? | |

Unique：`(documentId, versionKey)`。  
适用版本选择：`selectApplicableVersionAt(date)` / `selectCurrentApplicableVersion(now)`；仅 `PUBLISHED`。

---

## 4. ComplianceClause

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | |
| documentVersionId | FK | |
| clauseKey | string | 版本内稳定键，如 `art-27` |
| articleNumber | string | 展示用「第二十七条」 |
| chapter / section / heading | string? | |
| originalText | string? | **仅 FULL_TEXT 允许非空** |
| summary | string? | 结构化摘要（人工复核） |
| interpretation | string? | 可选辅助解读（明确非原文） |
| topics | string[] / JSON | |
| parentClauseId | string? | 自引用 |
| sortOrder | int | |
| createdAt / updatedAt | datetime | |

Unique：`(documentVersionId, clauseKey)`。  
Invariant：`originalText` 不得被 summary/AI 覆盖。

层级：章/节/条/款用 `parentClauseId + sortOrder` 表达，不拆多表。

---

## 5. ComplianceControl

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | |
| controlCode | string | unique，如 `CTRL-DATA-ACCESS-01` |
| title | string | |
| domain | ControlDomain | |
| description | string | |
| objectives | string? | |
| requiredContext | string[] | 字段键 |
| suggestedEvidence | string[] | |
| suggestedChecklistItems | string[] | |
| status | `ACTIVE` \| `DEPRECATED` | |
| createdAt / updatedAt | datetime | |

---

## 6. SecurityRuleMetadata（Catalog）

**Step 1：纯 Domain type，无 Prisma 表。** Executable 规则 SoT 仍为 `src/services/analysis` TS registry。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| ruleId | string | 对齐可执行规则 ID，如 `DATA-001` |
| title | string | |
| dimension | SecurityDomain | 分析维度 |
| description | string | |
| requiredFields | string[] | |
| sourceType | RuleSourceType | 仅 provenance；不执行 Sigma DSL |
| upstreamRuleId / upstreamVersion | string? | |
| sourceUrl | string? | |
| licenseId / licenseUrl | string? | |
| attribution | string? | |
| adaptationNote | string? | |
| capabilityStatus | RuleCapabilityStatus | SUPPORTED / NEEDS_CONTEXT / OUT_OF_SCOPE |
| executable | boolean | 是否挂到当前引擎（SUPPORTED 才可为 true） |

**外部 adapted 规则：** 无 license review → 不得 `executable=true`。完整 metadata registry 留 Step 8。

---

## 7. RuleControlMapping

| 字段 | 类型 |
| --- | --- |
| id | string |
| ruleId | string（无 Prisma FK；importer 校验 registry） |
| controlId | FK control |
| relation | `PRIMARY` \| `SUPPORTING` |
| rationale | string? |
| requiredContext | ContextRequirement[] JSON |
| priority | int |

Unique：`(ruleId, controlId)`。

---

## 8. ControlClauseMapping

| 字段 | 类型 |
| --- | --- |
| id | string |
| controlId | FK |
| clauseId | FK |
| relationType | ControlClauseRelation（无 INSUFFICIENT_CONTEXT） |
| rationale | string |
| requiredContext | ContextRequirement[] JSON |
| suggestedEvidence | EvidenceSuggestion[] JSON |
| suggestedChecklistItems | ChecklistSuggestion[] JSON |
| reviewStatus | `DRAFT` \| `REVIEWED` \| `APPROVED` |
| reviewedAt | optional（无 reviewedByUserId） |

Unique：`(controlId, clauseId, relationType)`。删除语义：`onDelete: Restrict`。

---

## 9. CaseComplianceFinding（Computed View）

**第一版不持久化表**（Step 1 仅 Domain type）。

```ts
type CaseComplianceFinding = {
  ruleId: string;
  controlId: string;
  documentId: string;
  documentVersionId: string;
  clauseId: string;
  relevance: CaseComplianceRelevance; // INSUFFICIENT_CONTEXT 在此
  rationale: string;
  missingContext: ContextRequirement[];
  suggestedEvidence: EvidenceSuggestion[];
  suggestedChecklist: ChecklistSuggestion[];
  versionSelectionBasis: "CASE_DATE" | "CURRENT_DATE";
};
```

不得含 `VIOLATED` / `COMPLIANT` / `ILLEGAL` / `BREACH_CONFIRMED`。

---

## 10. ComplianceReferenceSnapshot（Report）

嵌入 `ReportDraft` JSON（optional）；Step 1 **不建 Prisma 表**。

```ts
type ComplianceReferenceSnapshot = {
  documentId: string;
  documentVersionId: string;
  documentCanonicalCode: string;
  documentTitle: string;
  versionKey: string;
  versionLabel: string;
  clauseId: string;
  clauseKey: string;
  articleNumber: string | null;
  clauseHeading: string | null;
  relationType: ControlClauseRelation;
  rationaleSnapshot: string | null;
  sourceUrl: string | null;
  capturedAt: string; // ISO
};
```

不嵌入动态 User / reviewer 名称（沿用 Report Actor / HumanReview）。旧草稿缺失该数组 → 兼容。

---

## 11. Checklist 来源（Domain 决策）

现有：`origin: "SYSTEM" | "MANUAL"`。

**v1.4.0 落地（Step 6）：**

- **不**扩展 `origin` enum；加入项时 `origin=MANUAL`
- **不**使用 `note` 存 provenance（备注可被 Snapshot 覆盖）
- Domain 可选字段（写入 `caseState` JSON，无 Prisma migration）：  
  `sourceKind=KNOWLEDGE_SUGGESTED`  
  `sourceRef={ suggestionKey, kind, controlCodes, clauseRefs, relevance }`
- 去重键：`suggestionKey`（= `CaseComplianceChecklistItem.key`）

---

## 12. 权限

```ts
"KNOWLEDGE_READ" // Step 1 已加入 ROLE_PERMISSIONS（VIEWER/ANALYST/ADMIN）
// 未来有管理行为时再加
"KNOWLEDGE_ADMIN"
```

不扩展 UI capability（留 Step 3）。

---

## 13. SQLite / 存储决策（Step 1 落地）

| 决策 | 结论 |
| --- | --- |
| v1.4 Knowledge schema | **继续 SQLite**；migration `20260809150332_add_security_compliance_knowledge` |
| Domain 枚举 | TypeScript SoT；DB 存 String；Row→Domain 严格 parse |
| 数组 / 结构 | Prisma `Json`（topics / requiredContext / suggestions） |
| 日期 | Prisma DateTime；domain 按 UTC 日历日比较 |
| Executable SecurityRule | **仍仅 TS registry**；无 SecurityRule 表；`RuleControlMapping.ruleId` 无 FK |
| 条款正文 | DB 文本字段（受 contentMode 约束） |
| PDF/DOCX binary | **不**进 SQLite |
| 删除 | 产品无删除；FK `Restrict`；测试用 db reset |
| PostgreSQL | v1.5 再迁；本 migration 对 Case/Auth/Report **完全 additive** |

---

## 14. Migration 风险（提前标注）

1. Document/Version 分离一旦落地，勿再合并成单表「法规」  
2. publication vs legal 双状态勿合并  
3. Finding 若后期持久化，需与 Report snapshot 语义分离  
4. Clause `originalText` 体积：控制第一包规模；未来大文档用分页/文件化  
5. Mapping 枚举一旦对外展示，禁止再引入「违法」类取值  

---

## 15. 与现有表关系

- **不改** CaseRecord / CaseAuditLog / User 核心语义  
- ReportDraft JSON **可选扩展**  
- CaseAuditLog.actor FK Restrict 保持  
- 知识实体**不**挂 Case cascade 删除  
