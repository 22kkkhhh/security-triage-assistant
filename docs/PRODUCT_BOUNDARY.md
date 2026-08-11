# 产品边界

## 我们解决的问题

安全运营人员已经拥有数据库审计、安全监控、防火墙、
认证系统、堡垒机等工具。

真正的问题是：

- 告警来自不同系统
- 上下文分散
- 人工需要重复整理
- 研判步骤容易遗漏
- 证据难统一整理
- 事件过程需要人工记录
- 报告需要重复编写

Security Triage Assistant 用于解决上述问题。

---

## 核心工作流

新建研判
→ 导入事件
→ 补充上下文
→ 自动规则分析
→ 查看证据
→ 查看未知信息
→ 完成核查清单
→ 补充业务上下文
→ 人工形成结论
→ 记录处置过程
→ 编辑报告
→ 导出 DOCX

---

## V1 必须完成

- 手工录入
- CSV 导入
- 文本粘贴
- 字段标准化
- 数据安全分析
- 网络上下文分析
- 身份行为分析
- 三态判断
- Evidence
- Checklist
- Business Context
- Timeline
- 人工结论
- Word 报告

---

## V1 不做

详见 `AGENTS.md`。

任何新需求，如果不能直接帮助：

“研判 → 核查 → 证据 → 处置 → 报告”

则默认不进入 V1。

---

## 边界判定原则

任何功能如果不能直接服务「研判—核查—证据—处置—报告」，默认不做。

---

## v1.2 产品边界（案件运营留痕）

### 支持

- 案件操作留痕（CaseAuditLog）
- 交接说明（Handoff Note）
- 最近活动（Activity Feed / lastActivityAt）
- 报告创建 / 更新 / 导出操作留痕
- Semantic Command 与 Snapshot Autosave 分离

### 仍不支持（相对 v1.2 边界）

- 全局 SIEM 审计中心
- 不可篡改审计 / 不可抵赖
- 排班系统
- SOAR / 自动阻断
- 通知系统 / 邮件推送
- WebSocket 实时跨端推送
- Audit 全文检索 / 导出中心 / Soft Delete UI

> 注：用户身份认证 / RBAC 已在 **v1.3** 纳入（见下节）；上表保留 v1.2 时期边界表述。

---

## v1.3 产品边界（Identity / Access）

### 支持

- username + password 本地认证；Database Session
- ADMIN / ANALYST / VIEWER；Server-side Permission
- VIEWER 只读；Trusted USER Case Audit Actor；operationId ownership
- HumanReview 责任人来自 authenticated identity
- ADMIN 最小用户管理；自助改密；ADMIN 重置密码；Session 吊销
- 至少 1 个 enabled ADMIN；Production bootstrap admin CLI

### 仍不支持

- Enterprise IAM / SSO / MFA / OIDC / LDAP / 多租户
- Case ACL / 行级可见性隔离 / 自定义角色 / Permission Editor
  （v1.11 起支持运营级 Case Ownership / My Queue；Ownership ≠ ACL）
- SystemAuditLog / Login Audit / User Admin Audit
- 用户物理删除 / impersonation / ban 产品状态机
- username / email 修改；forgot-password；首次登录强制改密
- PostgreSQL / Docker / Connector / AI / 新检测规则 / 新报告产品能力
- 电子签名 / 不可抵赖合规审计 / 防篡改审计 / SIEM 替代
