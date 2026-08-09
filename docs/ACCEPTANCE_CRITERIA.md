# 验收标准

本文件用于防止“宣称做完但无法演示”。V1 必须通过以下两个 Demo。

---

## Case A：异常但合法

必须能够完整演示：

夜间大量敏感数据访问
↓
系统判定技术风险较高
↓
待核查业务合理性
↓
发现变更工单
↓
业务负责人确认
↓
人工结论：正常授权业务行为
↓
导出 Word

验收要点：

- 技术异常可被业务上下文合法化
- 最终结论由人工确认，而非系统自动定论
- 报告可导出为可编辑 `.docx`

---

## Case B：疑似安全事件

必须能够完整演示：

连续失败认证
↓
陌生 IP 成功登录
↓
跨多个业务系统
↓
大量读取敏感数据
↓
异常公网通信
↓
系统显示多维异常证据
↓
人工核查
↓
建议升级安全事件
↓
记录处置时间线
↓
生成 Word 报告

验收要点：

- 数据 / 网络 / 身份多维证据同时可见
- Timeline 可记录处置过程
- 报告包含证据与人工结论

---

## 通用验收清单

验收时必须证明：

- [ ] `UNKNOWN` 没有被显示成正常
- [ ] 用户可以改变最终结论
- [ ] 系统分析可以被人工修正
- [ ] Evidence 能进入报告
- [ ] Timeline 能进入报告
- [ ] Word 真的是 `.docx`
- [ ] Word / WPS 可继续编辑
- [ ] 没有调用外部 AI
- [ ] 没有自动阻断动作

未满足任一通用项，不得视为 V1 验收通过。

---

## v1.2 验收条件（操作审计 / 交接 / Activity Feed）

自动化或演示时必须证明：

- [ ] Timeline 与 Audit 语义分离（安全事件历史 vs 运营操作历史）
- [ ] Semantic Command 与业务状态同事务写入 Audit
- [ ] Snapshot Autosave 不刷 Audit（业务备注 / 人工说明 / 报告同会话后续保存）
- [ ] Snapshot Autosave 仅接受 allowlisted `CaseSnapshotPatch`；Semantic-owned 字段不得经 Snapshot 写入（未知字段 reject）
- [ ] `operationId` 幂等（重试不重复副作用）
- [ ] `lastActivityAt` 仅在有意义 Audit 时更新，且与最新 Audit 时间语义一致
- [ ] Activity Feed 按时间 DESC；支持 pagination（加载更多）
- [ ] 最新交接卡片正确；交接写入后 Feed 可见
- [ ] 报告创建 / 更新（会话首次）/ 导出产生对应 Audit
- [ ] stale 防覆盖：旧 `baseUpdatedAt` / `baseReportUpdatedAt` 不得覆盖新版本
- [ ] Audit UI 中文化（不直接展示原始 enum / JSON / operationId）
- [ ] Audit append-only（业务删除案件不静默级联抹掉审计的设计约束）
- [ ] 不夸大为生产级合规审计
- [ ] Seed Audit 幂等；Case A 结论仍为「正常授权业务行为」；Case B 仍为「疑似安全事件」
- [ ] 正式调查报告正文不意外嵌入操作审计全文（v1.2 无审计附件）
- [ ] `UNKNOWN` 不显示为低风险
- [ ] SYSTEM Checklist 不可删除（UI 不展示删除；Server 拒绝）
- [ ] Timeline 不用于记录研判操作；人工补充展示为「人工补充」而非「人工处置」
- [ ] User-facing 时间不展示 ISO 原始格式（无 `T` / `Z` / `+08:00`）

浏览器人工点验（A–J：交接 / 状态 / Checklist / 业务 / 人工 / Timeline /
报告 / 分页 / 双标签案件 / 双标签报告）在自动化通过后仍须由用户确认。

v1.2 Case 双 Tab 并发（I）：已在发布前用真实双 Page 浏览器一次性复测通过
（Status→BusinessContext / BusinessContext→Checklist / Status vs Status /
单 Tab sanity / Handoff→stale）。项目未将 Playwright 列为正式依赖；
长期回归保留 `caseConcurrency` 单测与 `scripts/smoke-v12-case-concurrency.ts`。

---

## v1.3 验收条件（Identity / Access — Release Candidate）

Domain foundation（Step 1）自动化必须证明：

- [x] `UserRole` 仅 ADMIN / ANALYST / VIEWER
- [x] Role → Permission 矩阵符合产品设计（含 VIEWER 只读、ANALYST 无 USER_ADMIN、ADMIN 全权限）
- [x] `enabled === false` 时 `hasPermission` / `authorize` 一律拒绝
- [x] `ForbiddenError.code === "FORBIDDEN"`；`UnauthenticatedError.code === "UNAUTHENTICATED"`
- [x] Auth Domain 不依赖 Better Auth package
- [x] Server Actions 通过 `requirePermission` 强制 authorize（Step 4）

Persistence foundation（Step 2）自动化必须证明：

- [x] Better Auth + Prisma 7 adapter 可创建 credential 用户（signup disabled）
- [x] Admin createUser 可设置 username（canonical lowercase）且无需绕过认证库
- [x] `User.role` 单 SoT；`toAuthUser` 拒绝非法/多角色
- [x] `enabled` 默认 true 且 create 路径 server-owned
- [x] Admin ACL 无 delete / impersonate；ANALYST/VIEWER 无 admin lifecycle
- [x] CaseAuditLog USER FK Restrict；MANUAL/SYSTEM actorId null 兼容
- [x] formal Prisma migration `add_auth_identity` 可从空库与 v1.2.1 forward

Login / Session（Step 3）自动化必须证明：

- [x] `/api/auth` 已挂载；public signup / username availability 仍关闭
- [x] username + password 登录；失败不区分用户名/密码
- [x] `requireAuthenticatedUser`：无 Session→未认证；enabled=false→Forbidden；DB reload role/enabled
- [x] `(app)` 未登录跳转 `/login`；logout 失效 Session
- [x] 开发 Demo Users 幂等；production 不 provisioning

Server Authorization（Step 4）自动化必须证明：

- [x] Authentication → DB reload → enabled → Permission → 业务逻辑顺序
- [x] VIEWER：读 Case/Activity/Report 允许；全部写与 REPORT_EXPORT 拒绝且无副作用
- [x] ANALYST/ADMIN：Case Semantic / Snapshot / Report create-edit-export 允许
- [x] 未授权优先于 validation / STALE / operationId
- [x] Snapshot allowlist 与 OCC / same-user operationId retry 保持
- [x] `/cases/new` VIEWER → Forbidden（非 redirect login）
- [x] cross-user operationId ownership **明确推迟到 Step 5**

Trusted Actor / operationId ownership（Step 5）自动化必须证明：

- [x] 认证写路径 Audit = USER（actorId/displayName 快照）；不使用 reviewer
- [x] same-user operationId retry → alreadyApplied；无重复 Audit
- [x] cross-user / MANUAL / SYSTEM operationId replay → FORBIDDEN
- [x] Seed CASE_CREATED 仍可为 SYSTEM；Legacy MANUAL 不迁移
- [x] displayName 变更不改写旧 Audit actorName

HumanReview Responsibility（Step 6）自动化必须证明：

- [x] `reviewer` / `reviewedByUserId` 仅 Server 在 semantic change 时写入
- [x] Snapshot / Semantic payload 注入 reviewer 或 reviewedByUserId → reject
- [x] note-only / Status / BC / Checklist / Timeline / Handoff 不抢责任人
- [x] NO-OP / same-user retry / cross-user replay / OCC stale 不改责任人
- [x] Legacy reviewer 无 reviewedByUserId 可加载；首轮 semantic 建立认证责任
- [x] Report 使用 reviewer 快照；已有 ReportDraft 不自动同步

UI RBAC Presentation（Step 7）必须证明：

- [x] capability 仅由 `hasPermission` 派生；Client 不硬编码 role 作为安全 SoT
- [x] VIEWER：只读 Workbench（Status/BC/HR/Checklist/Timeline/Handoff）；无新建入口
- [x] VIEWER：Report 可读；无生成；Export disabled；不触发 Case/Report autosave
- [x] ANALYST/ADMIN：Case/Report 操作 UI 可用；User Management 入口属 Step 8（capability）
- [x] Server Authorization / Trusted Actor / HR Responsibility / Snapshot / OCC 回归保持

User Management & Password Lifecycle（Step 8）自动化必须证明：

- [x] `/admin/users` 与 User Admin Actions 要求 `USER_ADMIN`；ANALYST/VIEWER → FORBIDDEN 无副作用
- [x] 创建用户：Better Auth provisioning；username canonical lowercase；enabled 固定 true；单角色
- [x] displayName 更新：AuthUser 新名称；历史 CaseAuditLog.actorName / HumanReview.reviewer 快照不变
- [x] role / enabled：DB reload 立即生效；禁用先提交 enabled=false 再吊销 Session（revoke 失败不回滚禁用）
- [x] last enabled ADMIN invariant（含并发危险 mutation）；disabled ADMIN 不计入
- [x] 自助改密：`PASSWORD_SELF_CHANGE` + Better Auth changePassword + revokeOtherSessions
- [x] ADMIN 重置他人：`PASSWORD_ADMIN_RESET`；禁止重置自己；成功后吊销目标 Sessions
- [x] mass-assignment reject；无物理删除 / impersonation / ban 产品路径
- [x] `user:bootstrap-admin`：无 enabled ADMIN 时可创建；已有则拒绝；无默认弱口令
- [x] 用户管理不写入 CaseAuditLog；无 SystemAuditLog

Release Hardening（Step 9）必须证明：

- [x] 安全宣称与 Known Limitations 一致；无过度 claim
- [x] Server entry / Permission SoT / Viewer·Analyst·Admin 边界回归
- [x] Snapshot / Trusted Actor / operationId / OCC / HR responsibility 回归
- [x] User admin / Password / last ADMIN / bootstrap / Demo isolation
- [x] fresh migrate + v1.2.1 forward migration；Case A/B 与 UNKNOWN 语义保持
- [x] production build smoke + 三角色 HTTP/页面冒烟；无 tag / 无 push

**正式 `v1.3.0` tag 须在本 Review PASS 后单独执行。**
