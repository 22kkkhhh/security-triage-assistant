# Codex 接管说明

## 权威来源

以仓库当前代码、Git 状态、`AGENTS.md` 与 `docs/` 为准；历史聊天摘要不是事实来源。发现冲突时，记录冲突并以仓库状态为准。

## 当前接管成果

`agent/codex-v1.5-m4-handoff` 自 M3 冻结点整合以下工作，保留原始提交历史：

1. C1：`c418140a530e1f921e79b06eb8cf386beaa4937d`
2. D1：`03bcde8b95115562d3c6aac51edd90246900f5b2`

整合顺序为 C1 → D1。两者均以 M3 为祖先，修改文件无交集，未修改 Prisma schema 或 migrations，合并无冲突。

## 继续工作的规则

- 未完成的 Codex 工作继续所在 `agent/codex-*` 分支。
- 新工作从最新 `origin/integration/<current-version>` 新建 `agent/codex-*` 分支。
- 不在 `integration/*`、milestone tag、`agent/cursor-*` 或 `agent/hermes-*` 上开发。
- 接管分支只做整合与交接，不顺带实现下一个 M4 项目。

## 当前验证状态

- lint：通过。
- TypeScript：通过。
- Prisma schema validate：通过。
- 全量测试与 build：需要在可用 Prisma Schema Engine 的环境复验；本机 `prisma migrate deploy` 在未修改 schema 的情况下失败，未返回具体引擎错误。

## 后续入口

阅读 [`v1.5/README.md`](./v1.5/README.md) 了解版本线与 [`v1.5/M4_PLAN.md`](./v1.5/M4_PLAN.md) 选择一个独立 M4 任务。
