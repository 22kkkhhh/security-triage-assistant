# v1.4 产品设计：安全与合规知识中心

> **状态说明：** 该文件为 v1.4 设计阶段归档。v1.4.0 已实现并发布；当前实现状态与冻结验收以 `docs/v1.4/RELEASE_CHECKLIST.md` 和根 `docs/ARCHITECTURE.md` 为准。
>
> Security & Compliance Knowledge Center
> 原设计状态：Design Locked（Step 0）
> 基线：v1.3.0 (`7f61fbc`)

---

## 1. 问题定义

分析员在研判时经常需要同时回答：

- 技术上发生了什么？
- 缺哪些上下文才能继续判断？
- 企业内部制度/法规要求通常关注哪些控制？
- 报告里应引用哪些条款作为「核查依据」，而不是「违法结论」？

当前产品有规则分析与 Checklist，但缺少：

- 可浏览的法规/制度知识入口
- Rule → 控制项 → 条款 的可解释关联
- Case-aware 的「缺什么 / 查什么」引导
- Report 中可固化、不随知识库漂移的引用快照

---

## 2. 产品定位

**正式名称：** Security & Compliance Knowledge Center（安全与合规知识中心）

**是：**

- 法规 / 管理办法 / 标准 / 内部制度的**受控知识浏览**
- 原文与结构化重点阅读
- Security Rule 与合规控制项、条款的关联导航
- 根据 Case 事实筛选**相关条款与缺失上下文**
- 建议 Evidence / Checklist（人工确认后才落地）
- Report 中的法规/制度关联引用（快照）

**不是：**

- 法律数据库 / 法规全文库产品
- AI 法律顾问
- 违法认定、法律意见、法律裁判
- 合规认证 / 等保测评平台
- SIEM / SOAR / 检测引擎替代品

核心原则延续 v1.3：

1. 人工最终决策  
2. Evidence > Conclusion  
3. `UNKNOWN` / missing context 一等语义  
4. 技术异常 ≠ 安全事件 ≠ 违法

---

## 3. 目标用户

| 角色 | 用法 |
| --- | --- |
| VIEWER | 浏览知识中心与 Case 关联只读结果 |
| ANALYST | 研判时查看关联条款、补上下文、确认加入核查项、写报告引用 |
| ADMIN | v1.4.0 无独立 Knowledge Admin UI；知识包由受控 seed/import 管理 |

---

## 4. 核心用户旅程

```text
Alert / Context
  → Security Rules（可执行逻辑仍在代码）
  → AnalysisResult
  → Compliance Controls
  → Compliance Clauses（按案件相关日期选版本）
  → Case-aware Relevance + Missing Context
  → Suggested Evidence / Checklist（待确认）
  → Human Review
  → Report（Compliance Reference Snapshot）
```

**Demo 成功标准（产品层）：**

- Case B：稳定展示 3–6 条真正相关条款，每条含 why / rule / control / missing / evidence / checklist，可跳原文  
- Case A：可显示相关控制/条款，但**不得**表现为「违规」；业务授权可降低运营关注，不消除知识相关性

---

## 5. 信息架构

### 5.1 Knowledge Center

- `/knowledge`：文档列表（标题、类型、机构、版本、法律状态、生效日）
- `/knowledge/documents/[documentId]`：文档详情（默认当前有效版本或选定版本）
- `/knowledge/documents/[documentId]/versions/[versionId]/clauses/[clauseId]`：条款锚点

第一版搜索：标题、文号、条款号、topic、control、keyword（SQLite LIKE / 简单索引）。  
不做：向量检索、Elasticsearch、RAG。

### 5.2 Case Workbench

新增 Panel/Tab：**法规与制度关联**（Compliance）

展示：

- 高相关 / 相关 / 可能相关 / 信息不足
- 法规名、条款、关联理由、Rule、Control
- Missing Context、Suggested Evidence、Suggested Checklist
- 「查看原文」→ Knowledge Center 条款位置
- 「加入核查清单」（显式确认，非自动写入）

### 5.3 Report

新章节：**法规与制度关联**

- 创建新报告时，从 Case 当前选中/默认 findings 生成 **ComplianceReferenceSnapshot**
- 已有 v1.3 Report：无该章节也可加载（optional 字段）
- 知识库更新**永不**自动改写已有 ReportDraft

---

## 6. 核心价值主张

| 价值 | 说明 |
| --- | --- |
| 可解释 | Rule → Control → Clause，禁止黑盒「违反某法」 |
| 可操作 | 缺字段、建议证据、建议核查项 |
| 可引用 | Report 快照绑定具体版本与条款 |
| 可演进 | Control 中间层隔离 Rule 与法律修订 |
| 可合规使用 | 权利/contentMode 限制全文打包 |

---

## 7. v1.4.0 范围（小而闭环）

| 纳入 | 不纳入 |
| --- | --- |
| 3–5 份精选文档、约 20–30 条款 | 批量导入 100+ 法规 |
| ~25–30 可运行规则（现有 11 + 约 10–15） | 批量 Sigma/Splunk DSL 执行 |
| Knowledge 只读 UI | PDF 上传中心 / OCR / 通用解析器 |
| Case-aware computed findings | Legal conclusion 引擎 |
| Report snapshot | SystemAuditLog / Policy ACL |
| Curated Knowledge Pack（JSON/YAML/TS + import） | 外部 AI 依赖核心路径 |
| INTERNAL_POLICY 数据模型预留 | 内部制度通用上传/自动解析（→ 1.4.1+） |

---

## 8. Non-goals（强制）

- 违法认定 / 合规认证 / 法律意见
- 外部 AI API 作为核心链路
- 自动向 Case 批量写入 Checklist
- Rule 直接绑死「某法律第 N 条」作为唯一模型
- 把所有文档类型都叫 LAW
- 用一个 status 混用「知识库发布」与「法律效力」
- 未知版权全文入库
- Case ACL / 多租户 / PostgreSQL 强制前置（v1.4 评估后可继续 SQLite）

---

## 9. Disclaimer（产品文案）

全局轻量提示 + Report 必含：

> 法规与制度关联结果用于安全研判和核查辅助，不构成违法认定、合规认证或法律意见。

卡片级不堆叠长篇免责声明。

---

## 10. 成功标准（First Release）

不是「导入了多少部法规」，而是：

1. Case B 能稳定给出 3–6 个**真正相关**条款  
2. 每条可解释：why / rule / control / missing / evidence / checklist  
3. 可跳转结构化原文  
4. Report 引用可快照且不随知识库漂移  
5. Case A 证明：相关 ≠ 违规  
6. 缺上下文时输出 `INSUFFICIENT_CONTEXT`，不得编造出境/泄露结论  

---

## 11. 主动挑战结论（产品层）

| 挑战 | 结论 |
| --- | --- |
| 是否先做 Knowledge UI 还是先灌开源规则？ | **先 Knowledge Center 闭环**；规则扩展必须服务 Case demo，禁止数量导向 |
| Control 中间层是否值得？ | **必须保留**；否则 Rule/法律修订交叉爆炸 |
| AI？ | **v1.4.0 非核心依赖**；最多未来做 draft 建议且需人工 review |
| 第一版规模？ | **坚持小范围**：3–5 文档、20–30 条款、约 25–30 可运行规则 |
| Checklist origin 是否立刻扩枚举？ | **可延迟**；先用 metadata `sourceRef`，避免无谓 Domain churn |
| Knowledge Admin UI？ | **v1.4.0 不做**；seed/import 即可 |
| PDF Viewer？ | **非核心**；结构化条款阅读优先 |
