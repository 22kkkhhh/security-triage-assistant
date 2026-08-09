# Changelog

本项目采用轻量变更记录。版本号遵循语义化约定；未打正式 tag 的条目以 `-rc` 标记。

## v1.3.0 — 2026-08-09

Added:
- 身份认证（username + password）与 Database Session（Better Auth 1.6.26）
- ADMIN / ANALYST / VIEWER 三角色与 Server-side Permission 强制
- Trusted USER Case Audit Actor；operationId 跨用户重放保护
- HumanReview 责任人绑定 authenticated identity（`reviewer` 快照 + `reviewedByUserId`）
- VIEWER 只读 UI（capability 呈现；Server Authorization 为最终边界）
- ADMIN 最小用户管理；自助改密；ADMIN 重置密码；Session 吊销
- last enabled ADMIN invariant；Production `user:bootstrap-admin`
- Case Snapshot write boundary hardening（Autosave allowlist）

Known Limitations（非本版本缺陷声明）：
- 无 Case Ownership / Case ACL；单实例 authenticated users 可查看全部 Case
- 无 MFA / SSO / SystemAuditLog / Login·UserAdmin·Password 全局审计
- SQLite 本地持久化；username/email 创建后不可改；无首次强制改密 / forgot-password
- UI capability 可能 stale；Legacy MANUAL Audit 与无 `reviewedByUserId` 的 reviewer 保留
- 不等于 Enterprise IAM、电子签名、防篡改合规审计或 SIEM 替代

## v1.2.1

Fixed:
- UNKNOWN observation 不再在内部携带 LOW 风险语义（`riskLevel` 为 `null`）
- 对齐 README 正式版本表述与 ARCHITECTURE 技术栈（去除未使用的 Zod / shadcn 声称）

## v1.2.0

- CaseAuditLog 操作审计（与 Timeline 分离）
- Semantic Command + Prisma 事务写入业务状态与 Audit
- Snapshot Autosave 不产生 Audit
- operationId 幂等、stale 防覆盖
- Activity Feed / 最新交接 / lastActivityAt
- 报告创建 / 更新（会话首次）/ 导出审计
- Demo Seed 幂等 Audit（Case A / Case B）

## v1.1.0

- 案件持久化与历史案件列表
- 报告草稿持久化与 DOCX 导出
- Case A / Case B Demo Seed
