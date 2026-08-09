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

## v1.3 验收条件（Auth Domain Foundation — 进行中）

Domain foundation（Step 1）自动化必须证明：

- [ ] `UserRole` 仅 ADMIN / ANALYST / VIEWER
- [ ] Role → Permission 矩阵符合产品设计（含 VIEWER 只读、ANALYST 无 USER_ADMIN、ADMIN 全权限）
- [ ] `enabled === false` 时 `hasPermission` / `authorize` 一律拒绝
- [ ] `ForbiddenError.code === "FORBIDDEN"`；`UnauthenticatedError.code === "UNAUTHENTICATED"`
- [ ] Auth Domain 不依赖 Better Auth package
- [ ] Server Actions 尚未强制 authorize（待后续 Authorization 接入 Step）

Persistence foundation（Step 2）自动化必须证明：

- [ ] Better Auth + Prisma 7 adapter 可创建 credential 用户（signup disabled）
- [ ] Admin createUser 可设置 username（canonical lowercase）且无需绕过认证库
- [ ] `User.role` 单 SoT；`toAuthUser` 拒绝非法/多角色
- [ ] `enabled` 默认 true 且 create 路径 server-owned
- [ ] Admin ACL 无 delete / impersonate；ANALYST/VIEWER 无 admin lifecycle
- [ ] CaseAuditLog USER FK Restrict；MANUAL/SYSTEM actorId null 兼容
- [ ] formal Prisma migration `add_auth_identity` 可从空库与 v1.2.1 forward

尚未验收（后续 Step）：Login UI、Session 强制、Server Action authorize、Trusted Actor、用户管理 UI。
