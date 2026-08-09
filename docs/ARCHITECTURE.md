# 架构约束

## 处理流水线

```text
输入层
↓
Normalizer
↓
SecurityCase
↓
Analysis Engines
├─ Data Risk
├─ Network Context
└─ Identity Behavior
↓
Correlation
↓
Evidence + Checklist
↓
Human Review
↓
Timeline
↓
Report Builder
↓
DOCX Generator
```

V1 为单体 Web 应用，不允许拆微服务。

---

## 技术栈（固定）

除非出现明确技术障碍并经批准，否则不得自行更换：

| 层级 | 技术 |
| --- | --- |
| Web 框架 | Next.js |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| UI 组件 | 项目内组件（未启用 shadcn/ui） |
| 数据库 | SQLite |
| ORM | Prisma |
| 校验 | TypeScript 类型（未启用 Zod） |
| CSV 解析 | PapaParse |
| Word 导出 | docx |

说明：`shadcn/ui`、`Zod` 曾列在早期技术设想中，当前仓库依赖与源码未正式使用；后续若引入需单独批准并更新本表。

---

## 代码结构

```text
src/
  domain/
  services/
    normalization/
    analysis/
    evidence/
    checklist/
    reporting/
  components/
  app/
```

要求：

- 业务逻辑与 UI 分离
- 分析引擎位于 `services/analysis`
- 报告构建与 DOCX 导出位于 `services/reporting`
- MVP 优先可读、可测试、可演示

---

## Write Model（v1.2）

写入路径刻意二分，避免「每次按键都刷审计」。

### A. Snapshot Autosave

用于：allowlisted 非语义字段的 silent debounced 保存（业务说明 / 工单号 / 业务负责人文本、人工研判说明、核查项备注；报告正文连续编辑走独立 ReportDraft 路径）。

客户端提交 `CaseSnapshotPatch`（字段补丁），**不得**提交完整 `PersistedCaseState`。

服务端流程：parse/allowlist 校验 → 加载 canonical case → 仅合并允许字段 → OCC（`baseUpdatedAt`）条件写入。

空 patch / 无实际变化：NO-OP（不抬升 `updatedAt`）。未知字段与 Semantic-owned 字段：**reject**（不静默忽略）。

特点：

- 更新 `CaseRecord.caseState` 或 `reportDraft`
- **不产生** `CaseAuditLog`
- 普通案件备注：`updatedAt` 变化，`lastActivityAt` 不变
- 普通报告 autosave：`reportUpdatedAt` 变化；同编辑会话首次 audited update 除外，`lastActivityAt` 不变

Snapshot-owned（案件路径）示例：

- `businessContext.businessJustification` / `changeTicketId` / `businessOwner`
- `humanReview.conclusionNote`
- `humanReview.reviewer`（temporary compatibility，待 Trusted Actor 改为 Server-owned）
- checklist **note only**（按 `checklistId`）

### B. Semantic Command

用于：明确业务动作（状态变更、Checklist 完成/重开/增删、结构化业务核查、结构化人工结论、添加 Timeline、交接、报告创建/导出会话首次更新/导出等）。

Semantic-owned 字段**只能**由 Command 修改，例如：`status`、结构化 BusinessContext、`finalConclusion` / `humanRiskLevel`、checklist 完成态/增删/身份字段、timeline、`caseData`、`suggestedRiskLevel`。

```text
Client
→ Server Action
→ Command
→ Prisma Transaction
   ├ Business State
   └ CaseAuditLog
```

特点：

- 业务状态与 Audit **同事务**
- 可选 `operationId` 幂等（重试不重复副作用）
- 成功写入 Audit 时更新 `lastActivityAt`
- Activity Feed 优先合并 Command 返回的 Audit，避免 `router.refresh` 冲掉未保存输入

---

## 四者边界

| 对象 | 含义 |
| --- | --- |
| `CaseState`（`caseState`） | 当前可恢复的案件研判快照（告警上下文、业务核查、Checklist、HumanReview、Timeline 等） |
| `ReportDraft` | 独立持久化的调查报告草稿；不等于案件快照，也不等于 Audit |
| `Timeline` | **案件事件事实历史**（安全事件 / 业务事件本身发生了什么） |
| `AuditLog`（`CaseAuditLog`） | **案件运营操作历史**（研判人员对案件执行了什么操作） |

禁止把 Audit 当作 Timeline，也禁止把 Timeline 当作操作审计。
人工补充 Timeline 并不代表「人工处置事件」；`source=HUMAN` 仅表示录入来源。

时间戳语义：

| 字段 | 含义 |
| --- | --- |
| `CaseRecord.updatedAt` | 案件主体状态最后保存时间 |
| `CaseRecord.reportUpdatedAt` | 报告草稿最后保存时间 |
| `CaseRecord.lastActivityAt` | 最近一次有意义 Audit 操作时间 |
| `CaseAuditLog.createdAt` | 单次运营动作发生时间 |

---

## 明确禁止

禁止为了“架构漂亮”制造：

- 无意义抽象
- 多层 Repository
- 微服务接口
- CQRS
- Event Sourcing
- 复杂设计模式
- Kafka / Redis / Elasticsearch / Kubernetes（V1）
- WebSocket 实时推送 / 全局审计中心（v1.2 不做）
