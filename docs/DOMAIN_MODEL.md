# 领域模型

## 核心对象

V1 只允许以下核心对象，禁止擅自扩展平行主实体：

```text
SecurityCase
├── AlertInfo
├── DataContext
├── NetworkContext
├── IdentityContext
├── BusinessContext
├── AnalysisResult[]      （由规则引擎生成）
├── Evidence[]            （由规则引擎生成，可人工补充）
├── ChecklistItem[]       （由规则引擎生成，可人工新增/编辑）
├── SuggestedAssessment   （由规则引擎生成，系统建议，非最终结论）
├── TimelineEvent[]
├── HumanReview
└── ReportData
```

如需新增字段，优先挂载到上述对象；不得另起一套平行 Case / Event / Incident 模型。

---

## 三态与风险等级

```ts
type ObservationStatus =
  | "NORMAL"
  | "ABNORMAL"
  | "UNKNOWN";

type RiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";
```

含义约束：

- `NORMAL`：当前数据足以判断为未见异常
- `ABNORMAL`：当前数据足以判断为异常或可疑
- `UNKNOWN`：当前没有足够数据进行判断（绝对不能解释为“正常”）

---

## 统一安全领域分类

`Evidence`、`ChecklistItem`、`AnalysisResult` 统一复用：

```ts
type SecurityDomain =
  | "DATA"
  | "NETWORK"
  | "IDENTITY"
  | "BUSINESS";
```

---

## 业务核查枚举

业务上下文禁止使用 NORMAL / ABNORMAL 表达“是否确认”语义，
必须明确区分“确认存在 / 确认不存在 / 未获取信息”：

```ts
type ExistenceStatus =
  | "CONFIRMED"   // 确认存在
  | "NOT_FOUND"   // 确认不存在
  | "UNKNOWN";    // 未获取信息

type ChangeTicketStatus = ExistenceStatus;

type VerificationStatus =
  | "CONFIRMED"       // 已确认
  | "NOT_CONFIRMED"   // 明确未获确认
  | "UNKNOWN";        // 尚未获取确认

type BusinessLegitimacy =
  | "AUTHORIZED"      // 已授权
  | "UNAUTHORIZED"    // 确认未授权
  | "UNKNOWN";        // 尚未判断
```

`BusinessContext` 使用上述枚举表达计划任务、变更工单、
负责人确认与业务合理性。

---

## 历史访问基线（最小模型）

`DataContext.baseline` 承载历史访问量摘要，仅用于基线比较：

```ts
interface DataBaselineContext {
  averageRecordCount: number | null;
  maxRecordCount: number | null;
  observationDays: number | null;
}
```

约束：

- 只接受已有/手工提供的历史摘要统计作为输入
- 禁止机器学习、UEBA、自动学习基线
- 字段为 `null` 表示未获取基线数据，对应规则必须输出 `UNKNOWN`

---

## AnalysisResult

```ts
interface AnalysisResult {
  ruleId: string;
  category: SecurityDomain;
  status: ObservationStatus;
  /** UNKNOWN 时为 null（不可评级，≠ LOW） */
  riskLevel: RiskLevel | null;
  title: string;
  explanation: string;
  evidenceIds: string[];
  verificationActions: string[];
}
```

要求：

- 禁止用 `isDangerous: boolean` 替代上述结构
- 禁止把三维评分简单平均成最终结论
- 每条分析结果必须可追溯到证据与建议核查事项
- 缺少必要数据时必须输出 `UNKNOWN`，并说明缺少什么信息、
  为什么无法判断、建议补充什么数据
- `UNKNOWN` 时 `riskLevel` 必须为 `null`，不得内部伪装为 `LOW`

---

## SuggestedAssessment

系统综合研判建议，与 `HumanReview` 严格分离：

```ts
interface SuggestedAssessment {
  data: DimensionAssessment;
  network: DimensionAssessment;
  identity: DimensionAssessment;
  businessLegitimacy: BusinessLegitimacy;
  evidenceConfidence: "LOW" | "MEDIUM" | "HIGH";
  suggestedRiskLevel: RiskLevel | null;
  summary: string;
  recommendedNextActions: string[];
}
```

要求：

- 禁止输出攻击概率
- 禁止生成“确认安全事件”类结论
- 措辞只允许：疑似 / 存在风险 / 建议核查 / 当前证据显示 / 暂无法排除
- 业务上下文确认合法时，系统建议应明确提示业务合法上下文，
  但不得覆盖 `HumanReview`

---

## 案件工作流状态

```ts
type CaseStatus =
  | "NEW"
  | "INVESTIGATING"
  | "PENDING_VERIFICATION"
  | "PENDING_BUSINESS_CONFIRMATION"
  | "RESPONDING"
  | "CLOSED";
```

状态由人工工作流控制，不根据风险等级自动强制流转；非强制线性审批流。

---

## HumanReview

人工最终结论取值：

```ts
type FinalConclusion =
  | "NORMAL_BUSINESS"
  | "SUSPECTED_SECURITY_INCIDENT"
  | "INCONCLUSIVE";   // 证据不足，暂无法定论
```

`INCONCLUSIVE` 为正式保留值，用于证据不足以形成结论的场景。

---

## 其他对象职责（简要）

| 对象 | 职责 |
| --- | --- |
| `SecurityCase` | 一次研判案件的聚合根 |
| `AlertInfo` | 导入/录入的原始告警与标准化字段 |
| `DataContext` | 数据安全相关上下文 |
| `NetworkContext` | 网络上下文 |
| `IdentityContext` | 身份与行为上下文 |
| `BusinessContext` | 工单、负责人、业务合理性确认 |
| `AnalysisResult` | 单条规则的分析输出 |
| `Evidence` | 可进入报告的证据条目（evidenceId / sourceType / timestamp / title / summary / relatedRuleId / analystNote），summary 必须说明“为什么系统认为该行为异常” |
| `ChecklistItem` | 人工核查清单项（支持未完成 / 已完成 / 人工编辑 / 人工新增） |
| `TimelineEvent` | **案件事件事实历史**（安全事件 / 业务事件本身发生了什么；`source=HUMAN` 仅表示人工补充录入，不等于「人工处置」事件类型） |
| `HumanReview` | 人工最终结论、人工风险等级与修正 |
| `ReportData` | 报告编辑态与导出内容：事件名称、案件编号、基本信息区（basicInfo 标签-内容对）、可编辑章节（sections）、进入报告的证据与时间线 ID；自动生成内容仅为初稿，结论章节来自 HumanReview，不得被 SuggestedAssessment 覆盖；正文时间统一为 UTC+8 人类易读格式 |
| `CaseAuditLog` | **运营操作历史**：研判人员/系统对案件的操作留痕（append-only） |

---

## CaseAuditLog（v1.2）

```ts
type AuditActionType =
  | "CASE_CREATED"
  | "STATUS_CHANGED"
  | "CHECKLIST_COMPLETED"
  | "CHECKLIST_REOPENED"
  | "CHECKLIST_ADDED"
  | "CHECKLIST_DELETED"
  | "BUSINESS_CONTEXT_UPDATED"
  | "HUMAN_REVIEW_UPDATED"
  | "TIMELINE_EVENT_ADDED"
  | "REPORT_CREATED"
  | "REPORT_UPDATED"
  | "REPORT_EXPORTED"
  | "HANDOFF_NOTE_ADDED";

type AuditActorType = "SYSTEM" | "MANUAL" | "USER";
```

关键字段：

- `operationId`：可选唯一键，用于 Semantic Command 幂等（Seed 使用稳定 `seed:v12:...`）
- `summary` / `changes` / `metadata`：短字段；禁止写入完整 `SecurityCase` / `reportDraft` / 敏感全文
- `CaseRecord.lastActivityAt`：最近一次有意义 Audit 时间（不等于 `updatedAt` / `reportUpdatedAt`）

分离规则：

| | Timeline | AuditLog |
| --- | --- | --- |
| 回答的问题 | 案件事件事实历史（发生了什么） | 案件运营操作历史（谁做了什么） |
| 典型条目 | 告警触发、异常登录、数据访问、业务确认事实 | 改状态、完成核查、补充 Timeline、交接、导出报告 |
| 人工补充 | 允许补充事件事实；`source=HUMAN` ≠ eventType「人工处置」 | 记录「谁执行了补充 Timeline」等操作 |
| 是否进入正式调查报告正文 | 可选进入 | v1.2 **不**自动进入 |

---

## 禁止事项

- 不得用 boolean 表示可能缺失数据的判断字段
- 不得自动生成不可推翻的最终安全事件结论
- 不得引入与核心流程无关的复杂状态机或微服务实体拆分
- 不得把 `UNKNOWN` 解释为“未发现异常”
- 不得混淆 Timeline 与 AuditLog
