# Codex 接管说明

## 权威来源

以仓库当前代码、Git 状态、根目录 `AGENTS.md` 和 `docs/` 为准；历史聊天摘要不是事实来源。发现冲突时记录冲突并以仓库状态为准。

## 已完成的 v1.5 整合

`agent/codex-v1.5-m4-handoff` 自 M3 冻结点整合并保留以下提交历史：

1. C1：`c418140a530e1f921e79b06eb8cf386beaa4937d`
2. D1：`03bcde8b95115562d3c6aac51edd90246900f5b2`

整合顺序为 C1 → D1；两者均以 M3 为祖先，未修改 Prisma schema 或 migrations。

## Codex 总控职责

Codex 接替此前的总控职责，而不是取代 Cursor / Hermes 的默认业务编码职责。详细协作规范见 [`v1.5/DUAL_AGENT.md`](./v1.5/DUAL_AGENT.md)：Codex 负责计划、拆分、ownership、实际审查、merge order 与 acceptance；Cursor 默认负责 UI/App，Hermes 默认负责 domain/backend。

## 当前过渡例外

`agent/codex-v1.5-m4-d2-runtime-fail-closed` 已由 Codex 实现 M4-D2。该分支继续由 Codex 完成 Acceptance；不回滚、不转交、不让 Cursor 或 Hermes 重复实现。D2 Acceptance 后，新 workstream 采用双开发 Agent + Codex 总控模式。

## 后续入口

阅读 [`v1.5/README.md`](./v1.5/README.md) 了解版本线，并阅读 [`v1.5/M4_PLAN.md`](./v1.5/M4_PLAN.md) 选择下一个独立 workstream。开始前先核验最新 `origin/integration/<current-version>` 与当前协作 ownership。