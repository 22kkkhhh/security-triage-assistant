# v1.5 双开发 Agent + Codex 总控约定

> 本文件是 Cursor / Hermes / Codex 的唯一详细协作执行规范。产品硬约束以根目录 `AGENTS.md` 为最高优先级；用户是最终决策者。

---

## 1. 组织与生效范围

默认组织：

```text
User
  ↓
Codex — Lead / Controller / Reviewer
  ├── Cursor — UI / App
  └── Hermes — Domain / Backend
```

- Codex 负责读取 repository state、milestone planning、架构审查、workstream 拆分、ownership 分配、任务指令、实际 Git/diff/test 核验、merge 顺序和 milestone acceptance。
- Codex 不因具备实现能力而默认接管 Cursor / Hermes 的业务编码；仅直接处理 project governance/docs、integration-only glue、明确指定的 shared file、merge conflict 与很小的跨 Agent integration fix。
- 本模式自 M4-D2 完成 Acceptance 后作为新 workstream 默认。进行中的 `agent/codex-v1.5-m4-d2-runtime-fail-closed` 仍由 Codex 完成 Acceptance，不迁移 ownership、不回滚、不由 Cursor 重复实现。

## 2. Baseline 与分支

| 项目 | 规则 |
| --- | --- |
| integration baseline | `integration/v1.5` |
| 新 workstream 起点 | 最新 `origin/integration/v1.5` |
| Cursor 分支 | `agent/cursor-v1.5-<topic>` |
| Hermes 分支 | `agent/hermes-v1.5-<topic>` |

开始前必须执行并记录：

```text
git fetch origin --tags
git status
git branch --show-current
git rev-parse HEAD
```

Cursor 和 Hermes 只可 commit / push 自己分支；不得自行 merge `integration/v1.5`、不得 force push shared 或 integration 分支。Codex 审查后才决定合入顺序和 Acceptance。

## 3. 默认 ownership

### Cursor

默认 owner：

- `src/components/**`
- `src/app/**`
- UI interaction、loading/error/empty、responsive/a11y
- frontend / UI tests

未获 Codex 在 workstream 中明确授权时，不得修改：

- `src/domain/**`
- `src/services/knowledge/**`
- `src/services/persistence/**`
- Prisma schema/migrations
- Evidence identity
- Frozen Report semantics

### Hermes

默认 owner：

- `src/domain/**`
- `src/services/**`（含 knowledge、persistence）
- backend contracts、runtime resolution
- backend / unit tests

未获 Codex 在 workstream 中明确授权时，不得修改：

- React components、layout、CSS 与 UI presentation
- Prisma schema/migrations

## 4. Shared / high-conflict

同一轮中下列区域只能由 Codex 在任务中指定的 **ONE OWNER** 修改；未指定 owner 时不得改动：

- `src/app/(app)/cases/[id]/page.tsx`
- `src/components/cases/PersistedCaseWorkbench.tsx`
- `src/services/caseCommands/**`
- `src/app/(app)/cases/commandActions.ts`
- `src/app/(app)/cases/reportActions.ts`
- `src/app/(app)/cases/actions.ts`
- shared DTO / cross-layer contracts、`src/domain/types.ts`
- `prisma/schema.prisma`、`prisma/migrations/**`、`prisma/seed.ts`

Codex 发出实现任务前必须先列出：

```text
Cursor owned files: ...
Hermes owned files: ...
Shared owner: ...
```

若无法安全并行，改为串行；不得为了并行而并行。

## 5. Codex 任务指令

Codex 必须明确接收者和可直接执行的范围，不得只写“前端负责”“后端负责”或“本机负责”。

需要 Cursor 时，指令必须以以下标题开始：

```text
下面这段发给 Cursor
```

需要 Hermes 时，指令必须以以下标题开始：

```text
下面这段发给 Hermes
```

每份任务至少包含：baseline、目标、owned files、禁止修改区、shared owner、必跑 tests/gates、commit/push 规则，以及不得自行 merge integration。

## 6. 返回后的 Codex Review

收到【Cursor 回复】或【Hermes 回复】后，Codex 必须实际核验：

1. branch、commit 与 `origin/integration/v1.5` baseline；
2. changed files 与 ownership 边界；
3. shared file conflict 与跨 Agent 语义一致性；
4. 实际 diff、tests/gates 输出；
5. merge order、回归风险和 milestone acceptance。

不得仅依据 Agent 自报“PASS”作出合入决定。

## 7. Validation 与产品边界

每个 workstream 至少运行 lint、TypeScript/typecheck、相关 tests、build；涉及 backend/data/persistence 时还必须运行 `prisma validate`。完整 gate 和汇报格式以 `AGENTS.md` 为准。

Prisma schema/migrations 默认禁止修改，只有用户明确授权后才能变更。现有产品边界、人工最终决策、UNKNOWN fail-closed、Evidence identity 与 Frozen Report semantics 不因协作模式改变。

## 8. v1.5 产品方向

当前主题是 Case Investigation Context：

```text
Case context update
  → persist
  → server-side security/compliance re-resolution
  → updated panel / checklist
  → human investigation
```

明确不实现新的法规平台、独立法律数据库、RAG/向量检索、自动法律判断或自动阻断处置。