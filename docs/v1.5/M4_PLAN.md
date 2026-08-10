# M4 Release Hardening 计划

本计划只记录当前 M4 状态与下一项，不授权在同一分支顺带实现全部项目。v1.5
采用“双开发 Agent + Codex 总控”：Cursor 与 Hermes 在各自 `agent/*` 分支完成
已分配 workstream，Codex 负责共享边界审查、整合顺序与 Acceptance；共享文件同一轮
只能有一个明确 owner。

## COMPLETE

### M4-D2：运行时失败 fail-closed UI — COMPLETE

- `RESOLUTION_UNAVAILABLE` 从 runtime DTO 传递到 Investigation Progress UI。
- resolver 不可用时显式提示，绝不伪装为全零成功进度或“全部已解决”。
- clean Ubuntu Verification 已覆盖该 regression。

### Production Environment Hardening（P1 / P1-E）— COMPLETE

- 拒绝 `.env.example` 的 `BETTER_AUTH_SECRET` 占位值；生产环境要求显式强密钥。
- production 缺失或空白 `DATABASE_URL` 时 fail-closed；development/test fallback 保留。
- `db:reset-demo` 在 destructive 操作前拒绝 production 环境执行。
- 未修改 Prisma schema 或 migrations；生产部署边界记录于
  `docs/v1.5/PRODUCTION_RUNBOOK.md`。

### User-facing Error Sanitization（P2）— COMPLETE

- 未知 Prisma、SQL、文件系统与内部异常不会进入 browser-visible ActionResult。
- 已知 STALE、STALE_REPORT、FORBIDDEN、validation 与 idempotency 语义及 code 保留。
- Server Action sanitizer 与 UI Error Boundary 共同提供两层防线。

### Semantic Command Canonicalization — COMPLETE

- Semantic Command 现在只接收最小 intent；服务端基于当前持久化 Case 构建 canonical
  persistence state。
- Browser 不再为 Status、BusinessContext、Checklist、Timeline 或 HumanReview
  semantic mutation 发送完整 Case state。
- 已移除 legacy complete-state compatibility；cross-field smuggling regression 继续覆盖，
  并保留 OCC、idempotency、authorization、audit、SYSTEM checklist protection 与
  KNOWLEDGE_SUGGESTED provenance 的测试。

### M4 Release Acceptance — COMPLETE

Release Acceptance: PASS

- Autosave silent data loss / false SAVED 已修复。
- Report autosave race 已修复。
- Compliance resolver failure 已显式标记为 `RESOLUTION_UNAVAILABLE`。
- Semantic Command minimal intent 已完成。
- Production hardening、error sanitization 与 D2 fail-closed 均通过。
- Auth/RBAC/OCC/HumanReview/Evidence provenance/Frozen Report 均通过。
- 最终 full Verification：66 files / 688 tests PASS。

## NEXT

### v1.5 Release / Tag — pending explicit user approval

## DEFERRED / NON-BLOCKING

- 重复 SYSTEM checklist label 的展示分组。
- duplicate analyze 性能优化。
- 完整 WCAG 覆盖。
- 新 E2E 框架。
- CONTEXT_MODEL_GAPS 持久化扩展。
- `destinationRegion` 新 schema 字段。
- PostgreSQL 迁移。
- Node 22 LTS 是否应作为生产推荐/支持运行时；当前不在本轮调整工具链。

未获明确批准前不得实现上述延后项。
