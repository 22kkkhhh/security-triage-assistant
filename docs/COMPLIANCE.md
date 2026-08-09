# 数据与合规约束

## Demo

只允许 Mock 数据。

禁止将真实企业安全事件、生产日志、真实账号、真实资产写入仓库或 Demo。

---

## 默认原则

- 本地处理
- 最小化取数
- 最小权限
- 敏感信息脱敏
- 人工审核
- 不自动外发
- 不连接生产环境
- 不调用公网 AI

---

## AI

V1 不调用任何外部大模型。

未来如果增加 AI：

必须单独进行数据流、权限、脱敏和部署方式评审。

未经明确批准，不得将：

- 安全日志
- SQL
- IP
- 用户账号
- 客户数据
- 事件报告

发送给第三方 AI 服务。

---

## 示例数据约束

- 示例 IP 仅使用测试地址或私网地址
- 姓名、手机号、账号等优先脱敏展示
- 不得提交内部安全平台截图或客户事件材料
- Seed / Demo 中所有人员均为虚构数据

---

## 操作审计（CaseAuditLog）≠ 生产合规审计

v1.2 提供案件级操作留痕，**不等于**生产级合规审计系统。

当前局限：

- v1.3 Step 4–7：Server Authorization + Trusted USER Actor + HumanReview 责任人 + UI 只读呈现已接入
- UI 隐藏写控件仅为 UX；**不得**替代 Server `requirePermission` 安全边界
- 新认证操作 Audit：`actorType=USER`，`actorId` 绑定真实 `User.id`（写入时快照 displayName）
- HumanReview 责任人来源为 authenticated server identity（`reviewedByUserId` + `reviewer` 快照）；
  仍是产品业务责任字段，**不等于**电子签名 / 不可抵赖 / 合规签章
- Legacy Seed / 历史记录仍可能为 `MANUAL` / `SYSTEM`；不得据此推断为已登录身份
- Trusted Actor 仍不等于防篡改 / 不可抵赖生产合规审计
- SQLite 本地库；无独立审计库
- 无防篡改 / 无不可抵赖保证

`BETTER_AUTH_SECRET` 必须为高熵密钥，仅存在于本地 `.env`（不得提交仓库）。

生产需要：强制认证、RBAC 服务端接入、可信 Actor、库表权限隔离、
集中审计、完整性保护、备份与保留策略。

Audit payload 必须最小化：禁止无意写入完整案件快照、完整报告草稿、
`analystNote` / `businessJustification` 全文或敏感数据表完整内容。
交接说明（`HANDOFF` metadata.note）为明确业务内容，长度 ≤ 2000。

---

## 交接说明（Handoff Note）

交接说明可能包含运营敏感信息。

要求：

- 最小化填写
- 不复制大段客户敏感数据
- 当前 Demo / 本地环境只允许 Mock / 授权数据
- 生产需数据权限、留存策略与访问审计
