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
- `humanReview.conclusionNote`（不改变研判责任人）
- checklist **note only**（按 `checklistId`）

禁止经 Snapshot 写入：`humanReview.reviewer` / `reviewedByUserId` /
`finalConclusion` / `humanRiskLevel`（runtime reject，不静默忽略）。

### B. Semantic Command

用于：明确业务动作（状态变更、Checklist 完成/重开/增删、结构化业务核查、结构化人工结论、添加 Timeline、交接、报告创建/导出会话首次更新/导出等）。

Semantic-owned 字段**只能**由 Command 修改，例如：`status`、结构化 BusinessContext、`finalConclusion` / `humanRiskLevel`、checklist 完成态/增删/身份字段、timeline、`caseData`、`suggestedRiskLevel`。

HumanReview Semantic Command 仅接受 `finalConclusion` / `humanRiskLevel`；
真实变化时 Server 写入责任人快照（`reviewer` + `reviewedByUserId`），并产生
`HUMAN_REVIEW_UPDATED` Audit。NO-OP 不抢责任人。

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

## Auth / Session / Server Authorization / User Admin（v1.3 Step 1–8）

业务授权模型独立于 Better Auth 内部 ACL，定义于 `src/domain/auth.ts`：

```text
/api/auth/[...all]（Better Auth handler）
  → Session（DB）
  → getCurrentAuthUser / requireAuthenticatedUser
       （Session 仅取 userId → Prisma reload User → toAuthUser + enabled）
  → (app) Layout：Session 边界（是否有效登录）
  → requirePermission(permission)
       （authorize → ROLE_PERMISSIONS）
  → Case / Report / Activity / User Admin / Account Server Actions
```

已建立：

- Domain：`AuthUser` / `UserRole` / `Permission` / `authorize`
- Persistence：Better Auth 1.6.26 + Prisma 7 SQLite adapter
- Login：`/login`（username + password）；Logout；开发 Demo Users
- Auth DAL：`disableCookieCache` + DB reload（enabled/role/displayName 新鲜度）
- `(app)` Layout Server 保护：未登录 → `/login`；disabled → 清 Session 并提示
- Server Authorization（Step 4）：`requirePermission` 接入全部 Case/Report/Activity
  读写入口；顺序为 Authentication → DB reload → enabled → Permission →
  parse / operationId / OCC / mutation；拒绝时无 DB 副作用
- User Administration（Step 8）：`/admin/users`（`USER_ADMIN`）+ `/account`（自助改密）
- Password：Better Auth `changePassword` / `setUserPassword` + Session 吊销；
  产品禁用态仅 `User.enabled`（不使用 ban）
- Bootstrap：`npm run user:bootstrap-admin`（显式 CLI；禁止 startup 自动建 ADMIN）

写边界两层仍独立且必须同时满足：

1. Permission（谁可以写）
2. Snapshot Payload Allowlist（允许写什么）

认证写路径 Audit Actor（Step 5）：

- `userActor(AuthUser)` → `actorType=USER`，`actorId=User.id`，`actorName=displayName` 写入时快照
- Server Action 复用 `requirePermission` 返回的 AuthUser；Client 不得提交 Actor
- `operationId` retry 校验 original actor ownership（跨用户 / Legacy MANUAL / SYSTEM 冒用 → FORBIDDEN）
- Seed / 系统创建仍可使用 `SYSTEM`；历史 `MANUAL` Audit 原样兼容
- Trusted Actor ≠ 防篡改 / 不可抵赖合规审计

Audit Actor vs HumanReview Responsibility（Step 6）：

| 概念 | 含义 |
| --- | --- |
| Audit Actor | 某次历史操作由谁执行（append-only 事件） |
| HumanReview Responsibility | 当前最终研判责任是谁（`reviewer` 快照 + 可选 `reviewedByUserId`） |

二者不得互相推导：不得用 `reviewer` 填 Audit Actor；不得从 Audit 反推当前责任人。
Report Builder 继续使用 `HumanReview.reviewer` 快照；已有 ReportDraft 不随责任人自动同步。

UI Permission Presentation（Step 7–8）：

- Server 用 `hasPermission()` 派生 capability DTO（`src/domain/uiCapabilities.ts`）
- Client 组件接收 capability 布尔值做只读呈现；**不**把 Client role 当作安全依据
- VIEWER：只读 Workbench / Report；隐藏新建与用户管理；可进入 `/account`
- ANALYST：Case/Report 操作 UI；无用户管理导航
- ADMIN：另见「用户管理」导航（`canManageUsers` ← `USER_ADMIN`）
- **UI permissions = UX；Server Authorization = 最终安全边界**（不得削弱 `requirePermission`）

User Admin 边界（Step 8）：

- 产品入口必须经 Security Triage Server Actions + Permission；禁止 Client 直调 `authClient.admin.*` 作为安全边界
- last enabled ADMIN invariant 在 Prisma transaction 内检查（role/enabled mutation）
- password set 与 session revoke 在 Better Auth 侧为独立 API；部分失败须显式提示，不得回滚已成功的 `enabled=false`
- 无 SystemAuditLog：Login / 改密 / 用户管理操作尚无独立全局审计（Known Limitation）

**v1.3.0（2026-08-09）已正式发布。**

已知限制（不得宣称已具备）：

- 无 Case Ownership / Case ACL；authenticated users 可查看全部 Case
- 无 MFA / SSO / forgot-password email / first-login forced password change
- username/email v1.3 immutable；无用户物理删除；无 impersonation
- 无 SystemAuditLog / Login Audit / User Admin Audit
- SQLite 本地；不等于 PostgreSQL 生产就绪 / HA
- UI capability 可能 stale；Server Authorization 为最终安全边界
- PostgreSQL isolation 语义需在后续 migration 后重新验证 last-ADMIN concurrency

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
