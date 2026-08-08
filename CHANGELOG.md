# Changelog

本项目采用轻量变更记录。版本号遵循语义化约定；未打正式 tag 的条目以 `-rc` 标记。

## v1.2.0-rc

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
