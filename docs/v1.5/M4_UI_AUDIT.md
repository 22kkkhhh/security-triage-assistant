# v1.5 Milestone 4 — UI & User-flow Hardening Audit

| 项 | 值 |
| --- | --- |
| Audit branch | `agent/cursor-v1.5-release-ui-audit` |
| Baseline | `integration/v1.5` @ `8545567190400de1fa0a555017c30e6d1baa7975` |
| Tag | `v1.5.0-m3`（已冻结，本轮未改 runtime） |
| Scope | Audit only；仅新增本文件 |
| Date | 2026-08-10 |

## Overall UI release readiness

**Conditionally ready for v1.5 UI freeze after addressing SHOULD_FIX items.**

- 未发现必须立刻挡住发布的 **RELEASE_BLOCKER**（无 Client 侧 Progress OPEN/RESOLVED 二次推导；无肯定性「违法认定 / 合规认证 / 自动结案」文案；VIEWER 能力接线与 Server RBAC 边界清晰）。
- 存在若干 **SHOULD_FIX_BEFORE_V1.5** 项：Progress 刷新面过窄导致陈旧计数、loader 失败 fail-open、语义命令飞行中「已保存」错觉、报告页导航高亮、窄屏侧栏、基础 a11y 标签。
- SYSTEM Checklist 同 label 重复为 **已知 NON_BLOCKING UX**；建议未来仅在 presentation 层优化，**禁止**按 label 合并 Domain identity。

---

## Findings by severity

### RELEASE_BLOCKER

无。

### SHOULD_FIX_BEFORE_V1.5

| ID | 区域 | 问题 | 证据 / 影响 |
| --- | --- | --- | --- |
| S1 | Progress refresh | Checklist / HumanReview 语义变更后不触发 `router.refresh()`，Progress 面板可长期显示旧 Server DTO | `PersistedCaseWorkbench`：refresh 仅挂在 BusinessContext 成功与 STALE；勾选核查后「待完成核查 / 已解决」滞后 |
| S2 | Progress loader | `loadCaseWorkbenchRuntime` 双失败时返回全 0 DTO（`hasUnresolvedInvestigationGaps: false`） | 解析失败被呈现为「无缺口」，HumanReview outstanding hint 也被关掉——违背「缺失显式表示」 |
| S3 | Save UX | 语义命令前 `cancelPendingSave()` 不改 autosave `status`；若先前为 SAVED，飞行中仍显示「已保存」 | CaseHeader / BusinessContextPanel 与共享 autosave；失败仅靠 `commandError`，易产生错误成功感 |
| S4 | Nav highlight | `/cases/[id]/report` 被侧栏匹配为「历史案件」而非「报告中心」 | `AppShell.tsx`：`/cases/*`（除 new）整段归入历史案件 |
| S5 | Report empty path | 无报告时的 `CreateReportPanel` 缺少「返回本案」入口 | 用户需靠侧栏绕行 |
| S6 | Empty/error shell | 无产品级 `not-found.tsx` / `loading.tsx` | `notFound()` 落默认页；慢 SSR 易白屏感 |
| S7 | Responsive | 固定 230px 侧栏，无折叠/抽屉 | `AppShell.tsx`；窄屏主区被挤占 |
| S8 | a11y basics | Checklist 可写 checkbox 缺 accessible name；BusinessContext `FieldBlock` 标签未 `htmlFor` 绑定 | 键盘/读屏基础缺口 |

### NON_BLOCKING UX

| ID | 区域 | 说明 |
| --- | --- | --- |
| N1 | Duplicate SYSTEM checklist labels | 不同 `ruleId+actionId` 可共享同一 label（Case A 约 4 组）。徽章已显示 `系统生成 · {relatedRuleId}`，correctness 不受影响 |
| N2 | Timeline VIEWER | 隐藏添加区但无显式「只读」角标 |
| N3 | ForbiddenPanel | 无「返回案件列表」快捷链（侧栏仍可用） |
| N4 | ImportFlow tabs | 缺完整 `aria-controls` / 方向键切换 |
| N5 | `generateChecklist` 注释 | 仍写「按 label 去重」，实现已是 `suggestionKey` |
| N6 | `toLocaleString()` | `DimensionPanels` 等未固定 locale，理论 hydration 边缘风险 |

### DEFERRED

| ID | 区域 | 说明 |
| --- | --- | --- |
| D1 | Knowledge Center 独立站 | v1.4 已声明延期；当前合规在 Case 工作台面板 + 外部官方来源链 |
| D2 | Progress 刷新策略产品化 | 是否在 checklist/HR 成功后也 `router.refresh()`，或引入轻量「进度可能已过期」提示 |
| D3 | Duplicate checklist presentation | 见下方最小方案（本轮不实现） |
| D4 | 完整 WCAG / E2E | 超出本轮基础 a11y 抽查 |

---

## 1. M3 Progress UI

| 检查项 | 结论 |
| --- | --- |
| Server DTO 唯一 SoT | **通过**。`page` → `loadCaseWorkbenchRuntimeViews` → `investigationProgress` prop → `toInvestigationProgressPanelView`；Client 不调用 `loadInvestigationProgress` |
| UI 不自算 OPEN/RESOLVED | **通过**。`investigationProgressSummary.ts` 仅字段映射 |
| BC save → `router.refresh` | **通过**。保存成功路径接线保留；刷新前保留旧 props，闪烁风险低 |
| loading / 陈旧 | **部分问题**：Checklist/HR 变更后不 refresh → **S1**；loader fail-open → **S2** |

Disclaimer「全部已解决不等于案件正常或可结案」已展示。

## 2. SYSTEM Checklist 重复展示（UX only）

**现状**

- `generateChecklist` 按 `suggestionKey`（`EVIDENCE:security:{ruleId}:{actionId}`）去重，**不会**因同 label 合并不同 Evidence。
- `ChecklistPanel` 对 SYSTEM 项展示「系统生成 · {relatedRuleId}」，可区分来源规则。
- Case A 可见约 4 组同 label、不同 suggestionKey（如 DATA-001/002 的「核查计划任务」）。

**禁止（本轮与后续）**

- 按 label 合并 Domain identity / suggestionKey
- 修改 Evidence resolution / provenance

**未来最小 presentation 方案（DEFERRED，不实现）**

1. 同 label 相邻项折叠为一条展示行；
2. 展示来源 badge：`规则 DATA-001 · DATA-002` 或「涉及 2 条规则」；
3. 可展开查看各 `suggestionKey` / ruleId；
4. 勾选完成仍按各自 checklist item id / suggestionKey 独立提交。

仅 UI 分组，不碰 identity。

## 3. Save / Error States

| 状态 | 评估 |
| --- | --- |
| 保存中 / 待保存 / 已保存 / 失败+retry | Snapshot autosave（CaseHeader / BusinessContext）基本完整 |
| OCC / stale | 有通知 + canonical 恢复 + refresh |
| FORBIDDEN | `actionErrorMessage` → 红条提示，无伪成功文案 |
| 语义命令飞行中 | **S3**：可能残留「已保存」 |
| HumanReview | 无独立保存态；依赖共享 autosave + commandError |

## 4. VIEWER

| 检查项 | 结论 |
| --- | --- |
| 可见只读内容 | 通过（readOnly 横幅 + 各面板只读呈现） |
| 可写控件 | BC / Checklist / HR / Timeline 受 capability 控制；Snapshot autosave 早退 |
| Server RBAC | UI 问题不能绕过；命令层仍校验权限 |

UI 层问题：Timeline 缺「只读」角标（N2）；不重复实现 auth。

## 5. HumanReview

| 检查项 | 结论 |
| --- | --- |
| outstanding 仅提示 | **通过**（不 hard-block） |
| Progress 全完成 ≠ 案件正常 | **通过**（Progress disclaimer + HR 事实行） |
| 人工结论与系统投影区分 | **通过**（独立「人工最终研判」面板；系统建议不写入该区） |

## 6. Compliance / Legal wording

用户可见免责为**否定式**（「不构成违法认定…」），符合研判辅助定位。

未发现肯定性「自动违法认定 / 合规认证 / 自动结案」产品文案。

## 7. Empty / Loading / Error

| 场景 | 状态 |
| --- | --- |
| 空案件 / 空报告列表 | 有中文空态 |
| 无合规 findings / 建议 | 有空态文案 |
| 无 checklist / 证据 / 时间线 | 有空态 |
| 无报告 | CreateReportPanel / Viewer 说明 |
| Forbidden | ForbiddenPanel |
| notFound / loading 骨架 | **S6** 缺口 |
| Progress loader 失败 | **S2** fail-open |

## 8. Navigation

| 路径 | 状态 |
| --- | --- |
| Case ↔ Report | 主路径完整 |
| Case → 官方合规来源 | 外链 allowlist；SUMMARY_ONLY 不伪造原文 |
| Knowledge Center 独立站 | **DEFERRED**（产品延期） |
| 报告页侧栏高亮 | **S4** |
| CreateReport 返回本案 | **S5** |

未发现指向不存在 in-app 路由的硬编码死链。

## 9. Responsive / Basic Accessibility

- 窄屏侧栏：**S7**
- Checklist / BusinessContext 标签关联：**S8**
- Progress 统计按钮有 `focus-visible`
- 未做完整 WCAG；未见全页键盘死锁

## 10. Production UX

- Root layout `suppressHydrationWarning`（扩展改写属性）已注明
- 时间展示固定 UTC+8 字符串，降低 hydration 风险
- Client 不导入 Prisma / `resolveCaseCompliance`（测试契约覆盖）
- 本轮未新开浏览器 E2E；未见代码内已知 hydration blocker 注释

## 11. Regression（设计/接线确认）

| 项 | 结论 |
| --- | --- |
| M1 Context → Compliance refresh | BC 成功路径 `router.refresh` 仍在 |
| M2 BusinessContext UI | 分组 / 待补充 / saveState 仍在 |
| M3 Progress UI | Server DTO SoT 仍在；时效见 S1 |
| v1.4 Knowledge UI | Case 内合规面板 + 外链；独立站延期 |
| Reports | 列表 / 编辑 / 导出路径存在 |
| VIEWER readonly | capability 贯穿 |

## 12. Gates（审计分支执行）

见提交前验证记录：lint / tsc / tests / build / prisma validate。

## 13. 本轮变更边界

| 类型 | 是否修改 |
| --- | --- |
| components / page / backend / domain / Prisma / identity | **否** |
| 文档 | **是**：仅本文件 |

---

## 推荐修复顺序（后续实现轮次，非本审计）

1. **S1 + S3**：语义命令成功后统一 refresh / 命令飞行中显式「处理中」状态，消除陈旧 Progress 与伪「已保存」。
2. **S2**：loader 失败展示「进度暂不可用 / UNKNOWN」而非全 0。
3. **S4 + S5**：报告导航高亮与返回本案。
4. **S6 + S7**：中文 not-found/loading 与窄屏侧栏。
5. **S8**：基础 form/checkbox 标签。
6. **N1 / D3**：presentation 层 duplicate checklist 分组（不碰 identity）。

---

## STOP

本文件为 Cursor M4 Workstream B 独占审计产出。不 merge `integration/v1.5`，不进入功能实现。
