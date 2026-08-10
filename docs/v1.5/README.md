# v1.5：Case Investigation Context

## 目标

v1.5 将案件上下文补充、服务端安全/合规重新解析、调查进度展示与人工核查连接为闭环：

```text
Case context update → persist → server-side re-resolution → updated panel/checklist → human investigation
```

它不是新的法规平台、RAG、自动法律判断或自动化阻断系统。

## 冻结基线

- M3 已验收：`v1.5.0-m3` / `8545567190400de1fa0a555017c30e6d1baa7975`。
- Security Evidence 身份：`ruleId + actionId`。
- 安全验证必须使用 `SECURITY_VERIFICATION` 来源与精确 security `suggestionKey`。
- 报告合规引用在创建时冻结；后续 runtime refresh 不得改写。

## 已整合硬化

- C1：报告冻结语义和 OCC、业务上下文与安全验证边界、目的地区域 fail-closed、解析失败状态。
- D1：工作台刷新与命令态、报告导航、页面状态、响应式和基础 a11y。

## 工作方式

开发前遵循根目录 `AGENTS.md` 的 Codex 分支规则；本版本线的协作历史见 `DUAL_AGENT.md`，当前计划见 `M4_PLAN.md`。
