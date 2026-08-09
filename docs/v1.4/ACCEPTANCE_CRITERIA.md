# v1.4 验收条件（设计基线）

> 用于后续实现 Steps 的验收合同。Step 0 不要求代码通过。

---

> **v1.4.0 范围说明：** 下列勾选项以 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 为准。  
> A/B 独立 Knowledge Center UI 与 I 规则扩量 **未进 v1.4.0**。

## A. Knowledge Center 浏览

- [ ] 已登录用户可打开知识中心列表（`KNOWLEDGE_READ`）— **延期**
- [ ] 列表展示：标题、类型、发文机构、版本、法律状态、生效日期 — **延期**
- [ ] 支持基础搜索与类型/状态过滤（非向量检索）— **延期**
- [ ] 未登录访问 → 认证失败 / 登录引导 — **延期（无独立页）**
- [x] VIEWER/ANALYST/ADMIN 均具备 `KNOWLEDGE_READ`（v1.4.0；经 Case 路径消费）

## B. Document / Clause Preview

- [ ] 文档详情可切换版本（至少展示 PUBLISHED 版本）— **延期**
- [ ] 条款目录 + 锚点跳转 — **延期**（Case 展开展示条款元数据；官方页不伪造锚点）
- [x] Case/Report 路径区分摘要 vs 原文意图；GB/T 标注 SUMMARY_ONLY
- [x] `contentMode=SUMMARY_ONLY` / METADATA 路径不把 originalText 当全文
- [x] 不依赖嵌入式 PDF Viewer 作为主阅读路径

## C. Version & Legal Status

- [x] Domain 分开展示 `publicationStatus` 与 `legalStatus`（pack / snapshot 字段）
- [x] Case 关联使用 CaseRelevantDate 选择版本
- [x] 无可靠案件日期时 fallback 当前有效版本，并明示依据（UI：版本选择依据）

## D. Rights Gate

- [x] rights 不允许全文时，导入/校验拒绝或强制 SUMMARY_ONLY（pack + repository）
- [x] 仓库/seed 不含未知版权全文标准 PDF（gitignore + 无 tracked PDF）

## E. Control / Mapping

- [x] 不存在「Rule 唯一直连 Clause」作为 SoT
- [x] Rule→Control、Control→Clause 均可追溯 rationale
- [x] 关系枚举无 VIOLATED / ILLEGAL / NON_COMPLIANT
- [x] 静态 ControlClauseRelation **无** `INSUFFICIENT_CONTEXT`（该值仅 Case finding relevance）
- [x] Step 1：Prisma Knowledge schema + Domain + `KNOWLEDGE_READ` + additive migration

## F. Case-aware Findings

- [x] Case 工作台展示合规关联 Panel
- [x] finding / panel 含：法规、条款、why、rule（审计区）、control、missing、建议
- [x] Missing Context 显式列出字段
- [x] 不得输出「已违法 / 已泄露 / 已违规出境」类结论文案
- [x] Case B：稳定相关条款（demo pack + Top-N）
- [x] Case A：可相关但不表现为违规；业务授权不消除知识相关性、也不升级违法语义

## G. Suggested Evidence / Checklist

- [x] 仅建议，不自动伪造「证据已存在」
- [x] Checklist **不**因规则命中自动批量写入 Case
- [x] 用户确认「加入核查清单」后才写入；具备去重 / operationId
- [x] 写入后不污染无关 Case；不影响 Case A/B seed audit 计数语义（除用户主动操作）

## H. Report

- [x] 新报告可含「法规与制度关联」章节（快照）
- [x] 知识库更新不改变已有 ReportDraft 快照
- [x] 旧 v1.3 Report 无该字段仍可加载
- [x] Report 含法规辅助免责声明

## I. Rules Expansion & Provenance

- [ ] 可执行规则总量约 25–30（含原 11）— **延期；v1.4.0 = 11**
- [ ] 外部 adapted 规则具备 license/provenance，否则不可 executable — **延期**
- [ ] capabilityStatus 区分 SUPPORTED / NEEDS_CONTEXT / OUT_OF_SCOPE — **延期**
- [x] 仍不执行 Sigma/Splunk DSL

## J. Permissions & Audit

- [x] 知识相关写路径走 Server Authorization（Checklist / Report）；Client 不重跑 resolve
- [x] 阅读合规参考不单独写 CaseAuditLog；建议写入走现有 Checklist audit
- [x] 不因知识中心引入 SystemAuditLog（Known Limitation）

## K. Non-goals（反向验收）

- [x] 无外部 AI 核心依赖
- [x] 无通用 PDF 上传解析中心
- [x] 无用户物理删除 / impersonation 回退
- [x] 无法律意见/认证表述

## L. Regression（v1.3）

- [x] Auth / RBAC / Trusted Actor / OCC / Snapshot allowlist / last ADMIN 不回归
- [x] Case A Audit=6、Case B Audit=4（在未人为改写 demo 的复位后）
- [x] UNKNOWN ≠ LOW
