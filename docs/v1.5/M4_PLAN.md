# M4 Release Hardening 计划

本计划只列出当前待办，不授权在同一分支顺带实现全部项目。每项应在独立 `agent/codex-*` 分支完成并经审查后集成。

## RELEASE_BLOCKER

### 数据库与生产环境硬化

- 审计 `BETTER_AUTH_SECRET` 的占位配置，生产环境必须显式提供强密钥。
- 生产环境必须显式提供 `DATABASE_URL`。
- 为 `db:reset-demo` 添加生产环境防护。
- 编写生产部署运行手册。
- 清除面向用户的原始内部 `error.message` 暴露。

约束：不得提交真实密钥，不更换数据库技术，不擅自修改 schema 或 migrations。

## HIGH

### M4-D2：运行时失败 fail-closed UI

后端已提供 `SUCCESS` 与 `RESOLUTION_UNAVAILABLE`。需要核对并连接：

```text
loadCaseWorkbenchRuntime → page DTO → PersistedCaseWorkbench → Investigation Progress UI
```

当 resolver 不可用时，必须显式提示“调查进度暂不可用”或“当前无法完成重新解析”；不得显示“0 个待补充”“0 个待核查”或“全部已解决”。UNKNOWN/error 不能视作成功。

## SHOULD_FIX

### 语义命令规范化

审计 `nextCaseState` 是否仍接受客户端完整状态。目标是服务端只接收该命令合法修改的最小 payload，并基于当前持久化状态构建 canonical next state，以防 cross-field smuggling、审计遗漏和未授权语义修改。

约束：不进行大型 command 架构重写。

## DEFERRED / NON-BLOCKING

- 重复 SYSTEM checklist label 的展示分组。
- duplicate analyze 性能优化。
- 完整 WCAG 覆盖。
- 新 E2E 框架。
- CONTEXT_MODEL_GAPS 持久化扩展。
- `destinationRegion` 新 schema 字段。
- PostgreSQL 迁移。

未获明确批准前不得实现上述延后项。
