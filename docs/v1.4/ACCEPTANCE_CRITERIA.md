# v1.4 验收条件（设计基线）

> 用于后续实现 Steps 的验收合同。Step 0 不要求代码通过。

---

## A. Knowledge Center 浏览

- [ ] 已登录用户可打开知识中心列表（`KNOWLEDGE_READ`）
- [ ] 列表展示：标题、类型、发文机构、版本、法律状态、生效日期
- [ ] 支持基础搜索与类型/状态过滤（非向量检索）
- [ ] 未登录访问 → 认证失败 / 登录引导
- [ ] VIEWER/ANALYST/ADMIN 均可读（v1.4.0）

## B. Document / Clause Preview

- [ ] 文档详情可切换版本（至少展示 PUBLISHED 版本）
- [ ] 条款目录 + 锚点跳转
- [ ] **原文**与**辅助解读/摘要**分区展示，标签清晰
- [ ] `contentMode=METADATA_ONLY` 时不渲染全文 originalText
- [ ] 不依赖嵌入式 PDF Viewer 作为主阅读路径

## C. Version & Legal Status

- [ ] `publicationStatus` 与 `legalStatus` 分开展示
- [ ] Case 关联使用 CaseRelevantDate 选择版本
- [ ] 无可靠案件日期时 fallback 当前有效版本，并明示「基于当前有效版本」

## D. Rights Gate

- [ ] rights 不允许全文时，导入/发布失败或强制降级 contentMode
- [ ] 仓库/seed 不含未知版权全文标准 PDF

## E. Control / Mapping

- [ ] 不存在「Rule 唯一直连 Clause」作为 SoT
- [ ] Rule→Control、Control→Clause 均可追溯 rationale
- [ ] 关系枚举无 VIOLATED / ILLEGAL / NON_COMPLIANT
- [ ] 静态 ControlClauseRelation **无** `INSUFFICIENT_CONTEXT`（该值仅 Case finding relevance）
- [x] Step 1：Prisma Knowledge schema + Domain + `KNOWLEDGE_READ` + additive migration

## F. Case-aware Findings

- [ ] Case 工作台展示合规关联 Panel
- [ ] 每条 finding 含：法规、条款、why、rule、control、missing、evidence、checklist 建议
- [ ] Missing Context 显式列出字段
- [ ] 不得输出「已违法 / 已泄露 / 已违规出境」类结论文案
- [ ] Case B：3–6 条稳定相关条款（demo pack）
- [ ] Case A：可相关但不表现为违规；业务授权不消除知识相关性、也不升级违法语义

## G. Suggested Evidence / Checklist

- [ ] 仅建议，不自动伪造「证据已存在」
- [ ] Checklist **不**因规则命中自动批量写入 Case
- [ ] 用户确认「加入核查清单」后才写入；具备去重 / operationId
- [ ] 写入后不污染无关 Case；不影响 Case A/B seed audit 计数语义（除用户主动操作）

## H. Report

- [ ] 新报告可含「法规与制度关联」章节（快照）
- [ ] 知识库更新不改变已有 ReportDraft 快照
- [ ] 旧 v1.3 Report 无该字段仍可加载
- [ ] Report 含法规辅助免责声明

## I. Rules Expansion & Provenance

- [ ] 可执行规则总量约 25–30（含原 11）
- [ ] 外部 adapted 规则具备 license/provenance，否则不可 executable
- [ ] capabilityStatus 区分 SUPPORTED / NEEDS_CONTEXT / OUT_OF_SCOPE
- [ ] 仍不执行 Sigma/Splunk DSL

## J. Permissions & Audit

- [ ] 知识阅读走 Server Authorization（非仅 UI 隐藏）
- [ ] 阅读法规不写 CaseAuditLog
- [ ] 不因知识中心引入 SystemAuditLog（Known Limitation）

## K. Non-goals（反向验收）

- [ ] 无外部 AI 核心依赖
- [ ] 无通用 PDF 上传解析中心
- [ ] 无用户物理删除 / impersonation 回退
- [ ] 无法律意见/认证表述

## L. Regression（v1.3）

- [ ] Auth / RBAC / Trusted Actor / OCC / Snapshot allowlist / last ADMIN 不回归
- [ ] Case A Audit=6、Case B Audit=4（在未人为改写 demo 的复位后）
- [ ] UNKNOWN ≠ LOW
