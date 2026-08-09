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

### 1.8 Mapping Relation（选定方案）

比较：

| 方案 A | 方案 B（选定） |
| --- | --- |
| DIRECT / RELEVANT / POSSIBLE / INSUFFICIENT_CONTEXT | CONTROL_SUPPORT / POSSIBLE_OBLIGATION / ESCALATION_TRIGGER / INSUFFICIENT_CONTEXT |

**选定 B**：更强调「控制支持 / 可能义务 / 升级触发」，避免用户把 DIRECT 读成「已违规」。

```ts
type ComplianceRelationType =
  | "CONTROL_SUPPORT"        // 支撑某项安全管理控制的核查
  | "POSSIBLE_OBLIGATION"    // 在补齐上下文后可能涉及相关义务
  | "ESCALATION_TRIGGER"     // 达到阈值时应升级人工/流程核查
  | "INSUFFICIENT_CONTEXT";  // 当前证据不足以建立更强关联
```

**禁止：** `VIOLATED` / `NON_COMPLIANT` / `ILLEGAL`。

### 1.9 Finding Relevance（Case UI）

```ts
type FindingRelevance =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT_CONTEXT";
```

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
| versionLabel | string | 如 `2021` / `修订版` |
| documentNumber | string? | 文号 |
| publishDate | date? | 公布 |
| effectiveDate | date? | 施行 |
| expiryDate | date? | 废止/失效 |
| publicationStatus | PublicationStatus | 知识库状态 |
| legalStatus | LegalStatus | 法律效力 |
| sourceType | KnowledgeSourceType | |
| rightsStatus | RightsStatus | |
| contentMode | ContentMode | |
| sourceUrl | string? | 官方来源 |
| sourceFileName | string? | 可选本地文件名（不入库 binary） |
| sourceFileHash | string? | sha256 |
| createdAt / updatedAt | datetime | |
| reviewedAt / publishedAt | datetime? | |

建议：同一 `documentId` 下 `(versionLabel)` unique；  
查询索引：`(documentId, publicationStatus, legalStatus, effectiveDate)`。

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

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| ruleId | string | PK，对齐可执行规则 ID，如 `DATA-001` |
| title | string | |
| dimension | SecurityDomain | 分析维度 |
| description | string | |
| requiredFields | string[] | |
| unknownPolicy | string? | UNKNOWN 语义说明 |
| sourceType | RuleSourceType | |
| upstreamRuleId / upstreamVersion | string? | |
| sourceUrl | string? | |
| licenseId / licenseUrl | string? | |
| attribution | string? | |
| adaptationNote | string? | |
| capabilityStatus | RuleCapabilityStatus | |
| executable | boolean | 是否挂到当前引擎（SUPPORTED 才可为 true） |

**外部 adapted 规则：** 无 license review → 不得 `executable=true` / 不得进入内置可运行集。

---

## 7. RuleControlMapping

| 字段 | 类型 |
| --- | --- |
| id | string |
| ruleId | FK metadata |
| controlId | FK control |
| relation | ComplianceRelationType |
| rationale | string |
| requiredContext | string[] |
| priority | int |

Unique：`(ruleId, controlId, relation)`（或更简 `(ruleId, controlId)`）。

---

## 8. ControlClauseMapping

| 字段 | 类型 |
| --- | --- |
| id | string |
| controlId | FK |
| clauseId | FK |
| relationType | ComplianceRelationType |
| rationale | string |
| requiredContext | string[] |
| suggestedEvidence | string[] |
| suggestedChecklistItems | string[] |
| reviewStatus | `DRAFT` \| `REVIEWED` \| `PUBLISHED` |
| reviewedBy / reviewedAt | optional |

---

## 9. CaseComplianceFinding（Computed View）

**第一版不持久化表**（可后续加 cache 表）。

```ts
type CaseComplianceFinding = {
  caseId: string;
  ruleId: string;
  controlId: string;
  documentVersionId: string;
  clauseId: string;
  relevance: FindingRelevance;
  relationType: ComplianceRelationType;
  rationale: string;
  missingContext: string[];
  suggestedEvidence: string[];
  suggestedChecklist: string[];
  basedOnCurrentEffectiveVersion: boolean;
  caseRelevantDate: string | null;
};
```

---

## 10. ComplianceReferenceSnapshot（Report）

嵌入 `ReportDraft` JSON（optional）：

```ts
type ComplianceReferenceSnapshot = {
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  versionLabel: string;
  clauseId: string;
  articleNumber: string;
  clauseHeading?: string | null;
  summarySnapshot?: string | null; // 生成时摘要快照，非 live
  sourceUrl?: string | null;
  relationType: ComplianceRelationType;
  rationale: string;
  ruleId?: string | null;
  controlId?: string | null;
  capturedAt: string; // ISO
};
```

旧草稿缺失该数组 → 兼容。

---

## 11. Checklist 来源（Domain 决策）

现有：`origin: "SYSTEM" | "MANUAL"`。

**v1.4.0 建议：**

- 不立刻扩展 enum（降低 migration 风险）
- 加入项时 `origin=MANUAL`
- 在 note 或并行 metadata（若 Snapshot allowlist 允许扩展）记录：  
  `sourceKind=KNOWLEDGE_SUGGESTED`, `sourceRef={controlId,clauseId}`

若实现期发现 note 不可靠，再单独立项扩展：

`origin: "SYSTEM" | "MANUAL" | "KNOWLEDGE_SUGGESTED"`

**仅设计，本 Step 不改 Domain。**

---

## 12. 权限（Domain 候选）

```ts
// 候选 Permission（Step 1 实现时加入 ROLE_PERMISSIONS）
"KNOWLEDGE_READ"
// 未来
"KNOWLEDGE_ADMIN"
```

v1.4.0：`KNOWLEDGE_READ` ∈ VIEWER/ANALYST/ADMIN。  
`KNOWLEDGE_ADMIN`：deferred。

---

## 13. SQLite / 存储决策

| 决策 | 结论 |
| --- | --- |
| v1.4 Knowledge schema | **可继续 SQLite** |
| 条款正文 | DB 文本字段（受 contentMode 约束） |
| PDF/DOCX binary | **不**进 SQLite；仅 file ref（v1.4.0 curated pack 可无 binary） |
| PostgreSQL | v1.5 Production Foundation 再迁；migration 保持可前向 |

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
