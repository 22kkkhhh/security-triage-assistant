# v1.5 �?Agent 协作约定

> 本文件是 **唯一** �?Cursor / Hermes �?Agent 协作细则�?
> 产品硬约束仍以根目录 `AGENTS.md` 为最高优先级；此处不另建第二套总规则�?

---

## 1. Baseline

| �?| �?|
| --- | --- |
| Stable release | `v1.4.0` |
| v1.5 integration branch | `integration/v1.5` |
| Work branch 起点 | **必须**从最�?`integration/v1.5` 创建 |

每次开始任务前：`git fetch`，确认基于最�?`origin/integration/v1.5`�?

---

## 2. Cursor ownership

### Primary（默认由 Cursor 负责�?

- `src/components/**`
- `src/app/**`
- Case UI / interaction
- Server Component / Server Action glue
- loading / error / empty state
- frontend / UI tests

### 默认禁止（除非任务明文授权）

- Prisma `schema` / `migrations`
- `src/services/knowledge/resolveCaseCompliance.ts`
- SecurityRule registry（`src/services/analysis/runRules.ts` �?rules�?
- curated pack（`src/services/knowledge/pack/**`�?
- report frozen snapshot 语义（创建时固化 / 导出只读 Snapshot 的契约）

---

## 3. Hermes ownership

### Primary（默认由 Hermes 负责�?

- `src/services/knowledge/**`
- `src/domain/**`
- `src/services/persistence/**`
- backend service contracts
- runtime resolution
- backend / unit tests

### 默认禁止（除非任务明文授权）

- React components / layout / CSS
- curated pack（`src/services/knowledge/pack/**`�?
- report rendering（`src/services/reporting/**` 展示�?DOCX 组装�?
- Prisma `schema` / `migrations`

---

## 4. Shared / high-conflict

下列文件 / 区域同一时间 **只能** 有一�?workstream 被授权修改：

- `src/app/(app)/cases/[id]/page.tsx`
- `src/components/cases/PersistedCaseWorkbench.tsx`
- `src/services/caseCommands/**`
- `src/app/(app)/cases/commandActions.ts`
- `src/app/(app)/cases/reportActions.ts`
- `src/app/(app)/cases/actions.ts`
- shared DTO / type contracts（含跨层接口�?
- `src/domain/types.ts`
- `prisma/schema.prisma` �?`prisma/migrations/**`
- `prisma/seed.ts`

未获任务指定为唯一 owner 时，**不得**改动 Shared 列表�?

---

## 5. Git workflow

```text
origin/integration/v1.5
  �?agent/cursor-<topic>   �?  agent/hermes-<topic>
  �?PR / 审查
  �?合入 integration/v1.5
```

规则�?

1. 从最�?`integration/v1.5` 创建 `agent/cursor-*` / `agent/hermes-*`
2. 每个 Agent **�?* commit / push 自己�?branch
3. �?PR / 审查后再合入 `integration/v1.5`
4. **禁止** Agent 自行 merge �?`integration/v1.5`
5. **禁止** force push `integration/v1.5`（及其他 shared integration 分支�?
6. 开始任务前必须 `fetch` 并确�?baseline

---

## 6. Validation

完成任务至少运行�?

| Gate | 要求 |
| --- | --- |
| lint | 必须 |
| tsc / `typecheck` | 必须 |
| tests | 按任务要求跑相关或全�?|
| build | 必须 |
| `prisma validate` | 涉及 backend / data / persistence 时必�?|

汇报格式仍遵�?`AGENTS.md` �?13 节�?

---

## 7. Product direction（v1.5�?

**当前主题�?* Case Investigation Context

核心目标链路�?

```text
Case context update
  �?persist
  �?server-side security/compliance re-resolution
  �?updated panel / checklist
  �?human investigation
```

**明确不是�?*

- 新法规平�?/ 独立法律数据�?
- RAG / 向量检�?
- 自动法律判断 / 违法认定
- autonomous remediation / 自动阻断处置
