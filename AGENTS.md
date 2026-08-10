# Security Triage Assistant 开发约束

## 1. 输出语言

所有面向用户、产品负责人以及开发汇报的自然语言内容，默认必须使用简体中文。

包括但不限于：

- 开发计划
- 架构说明
- 修改说明
- 测试结果
- 错误说明
- README
- UI 文案
- 表单提示
- 报告内容
- Demo 数据说明

以下内容可以保留英文：

- 代码变量名
- 类型名
- 函数名
- API 名称
- 标准协议名称
- SQL
- 技术库名称
- 必须使用英文的行业标准术语

禁止在一次开发汇报中无意义地中英文混杂。

---

## 2. 产品定位

本项目名称：

Security Triage Assistant
数据与网络安全联合研判及报告助手

本项目不是一个新的：

- SIEM
- SOC 平台
- IDS / IPS
- NDR
- DLP
- 数据库审计平台
- 漏洞扫描器
- 日志采集平台
- 自动化攻击阻断系统
- SOAR

默认企业已经存在成熟的安全产品。

本项目只负责：

已有安全告警或日志
→ 导入
→ 标准化
→ 补充上下文
→ 辅助研判
→ 证据整理
→ 人工确认
→ 处置记录
→ 报告编辑
→ 导出 DOCX

---

## 3. 核心原则

所有设计必须遵循：

1. 人工最终决策
2. 结果可解释
3. 缺失数据必须显式表示
4. 技术异常不等于安全事件
5. 必须考虑业务合理性
6. 证据优先于结论
7. 最小化数据处理
8. Demo 禁止使用真实企业数据

---

## 4. 严禁擅自新增的功能

未经明确批准，不得实现：

- 实时日志采集
- Agent（指产品运行时 autonomous agent 功能，不含 Cursor / Hermes 等开发编码 Agent）
- Syslog Server
- PCAP 抓包
- Nmap 扫描
- 漏洞扫描
- 恶意文件分析
- 威胁情报联网查询
- 自动攻击链判定
- 自动封禁账号
- 自动阻断 IP
- 自动修改防火墙
- Kafka
- Redis
- Elasticsearch
- Kubernetes
- 微服务拆分
- 外部 AI API
- LLM Agent（同上：产品运行时能力；不含开发编码 Agent）
- 用户权限系统（指禁止擅自扩展 Enterprise IAM / 多租户权限平台；v1.3 已批准并交付的 Auth/RBAC 为既有基线，不得删除或重做）
- 多租户
- 复杂审批流
- 实时 WebSocket 告警

如果认为某功能有价值，只允许在开发总结中的“未来建议”中提出，
不得自行实现。

---

## 5. 风险分析原则

系统分析三个维度：

- 数据安全
- 网络安全
- 身份行为

禁止简单通过三个评分取平均得到最终结论。

规则分析的核心输出应该是：

- 规则 ID
- 规则类别
- 当前状态
- 风险等级
- 判断依据
- 证据
- 建议核查事项

系统可以内部使用数值评分辅助排序，
但 UI 不应把未经真实数据验证的精确数字包装成科学概率。

优先使用：

- 低风险
- 中风险
- 高风险
- 严重

---

## 6. 三态模型

任何可能因为数据缺失而无法判断的字段，
禁止单纯使用 boolean。

统一采用：

- NORMAL
- ABNORMAL
- UNKNOWN

UNKNOWN 表示：

“当前没有足够数据进行判断。”

UNKNOWN 绝对不能被解释成：

“没有发现异常。”

---

## 7. 人工研判

系统不得自动宣布：

- 黑客入侵
- 数据泄露已发生
- 账号已失陷
- 攻击者正在横向移动

系统应使用：

- 疑似
- 可能
- 存在风险
- 建议进一步核查
- 当前证据显示
- 暂无法排除

最终结论必须由人工确认。

---

## 8. 业务上下文

任何高风险技术行为都必须允许补充：

- 是否存在计划任务
- 是否存在变更工单
- 工单编号
- 业务负责人
- 负责人确认结果
- 业务合理性说明

必须支持：

技术异常度高
+
业务确认合法
=
正常授权业务行为

---

## 9. 数据安全

Demo 只能使用虚构数据。

禁止写入仓库：

- 真实姓名
- 真实手机号
- 真实身份证
- 真实企业账号
- 真实公网资产
- 客户数据库地址
- 生产日志
- 内部安全平台截图
- 客户安全事件

所有示例 IP 使用测试或私网地址。

敏感信息展示应优先脱敏。

---

## 10. Word 报告

主要输出格式为：

.docx

必须满足：

- Microsoft Word 可编辑
- WPS 可编辑
- 正文可修改
- 表格可修改
- 标题可修改
- 研判结论可修改
- 整改建议可修改

报告生成前必须存在人工编辑/确认阶段。

不得直接把自动分析结果作为最终正式报告。

---

## 11. 代码边界

业务逻辑与 UI 必须分离。

优先结构：

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

禁止为了“架构漂亮”制造：

- 无意义抽象
- 多层 Repository
- 微服务接口
- CQRS
- Event Sourcing
- 复杂设计模式

MVP 优先可读、可测试、可演示。

---

## 12. 修改原则

开始编码前：

1. 阅读本文件
2. 阅读相关 docs
3. 检查现有代码
4. 说明计划修改哪些文件
5. 判断是否超出 MVP 边界

完成修改后：

1. 运行 lint
2. 运行 TypeScript 检查
3. 运行相关测试
4. 必要时运行 build
5. 修复阻塞错误

不得在未说明情况下：

- 大规模重构
- 更换技术栈
- 删除已有功能
- 重命名核心 Domain 类型
- 修改核心产品流程

---

## 13. 开发完成后的固定回答格式

每次完成任务后，只用简体中文汇报：

### 已完成
- ...

### 修改文件
- ...

### 验证结果
- lint：
- TypeScript：
- test：
- build：

### 尚未处理
- ...

### 是否存在超范围内容
- 无 / 有，说明原因

不要输出大段无意义开发过程。

---

## 14. 双开发 Agent + Codex 总控

自 M4-D2 完成 Acceptance 后，默认组织为：用户负责最终决策；Codex 负责 Lead / Controller / Reviewer；Cursor 负责 UI / App；Hermes 负责 Domain / Backend。

- Codex 必须先读取 repository state、拆分 workstream、指定 ownership、审查 branch / diff / tests，并决定 merge 顺序与 milestone acceptance。
- Codex 默认不承担 Cursor 或 Hermes 的完整业务编码；只直接处理项目治理文档、integration-only glue、明确指定的 shared file、merge conflict 与很小的跨 Agent integration fix。
- Cursor 默认负责 `src/components/**`、`src/app/**`、UI interaction、loading/error/empty、responsive/a11y 与 frontend/UI tests。
- Hermes 默认负责 `src/domain/**`、`src/services/**`、persistence、backend contracts、runtime resolution 与 backend/unit tests。
- Prisma schema/migrations、Evidence identity、Frozen Report semantics 仍须明确授权；shared/high-conflict 文件在同一轮只能有一个任务指定的 owner。

`docs/v1.5/DUAL_AGENT.md` 是唯一详细协作执行规范；本节只声明总控原则，不重复其 ownership、任务指令与审查流程。

## 15. 分支与 workstream 工作流

`integration/*` 仅为集成基线，禁止直接开发业务功能。

每个任务开始前必须执行：

```text
git fetch origin --tags
git status
git branch --show-current
git rev-parse HEAD
```

分支决策规则：

```text
是否继续尚未完成且已明确由 Codex 承担的任务？
  是：继续该任务既有的 agent/codex-* 分支。
  否：
    是否为新任务？
      是：Codex 先指定 Cursor / Hermes / shared owner；实现 Agent 从最新 origin/integration/<current-version> 创建自己的 agent/<agent>-<version>-<topic> 分支。
      否：停止并向用户说明当前分支状态。
```

硬性约束：

- 禁止直接在 `integration/*` 上实现功能。
- 禁止在 milestone tag 上开发。
- 不得进入 `agent/cursor-*` 或 `agent/hermes-*` 分支开发；仅在明确的接管、审查或整合任务中只读审计其历史。
- Cursor / Hermes 仅可 commit / push 自己分支，不得自行 merge integration 或 force push shared / integration 分支。
- 已合并或已完成的旧任务分支不能作为新任务的开发起点。
- `integration/<current-version>` 是版本线变量；版本升级后必须更新基线，不得把 `v1.5` 硬编码为永久规则。
- 无法安全分配 owner 或判断应继续哪个任务分支时，停止修改并先向用户报告。
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
