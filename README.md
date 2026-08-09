# Security Triage Assistant

数据与网络安全联合研判及案件运营助手。

当前稳定版本：**v1.2.x**（本地可运行的安全研判与案件运营 **MVP / Prototype**）。  
不是 Production-ready 企业平台。

## 一、项目是什么

本工具帮助安全人员在**已有安全平台告警之后**完成：

导入 → 标准化 → 多维辅助研判 → 业务合理性核查 → 证据与核查清单 →
人工结论 → 案件持续管理 → 操作审计与交接 → 报告编辑 → 导出可编辑 Word（DOCX）

目标：连接已有安全平台产生的信息，支持导入、标准化、多维辅助研判、业务核查、
人工结论、案件持续管理、报告、操作审计与交接班。

**不是** SIEM / SOC / IDS / NDR / DLP / 漏洞扫描器 / 日志采集平台 / SOAR 的替代品。
默认企业已经存在成熟的安全检测产品；本项目只做研判、案件运营与报告整理。

## 二、解决的问题

已有安全平台：负责检测并产生告警。

本工具负责：

- 导入（手工 / CSV / 文本粘贴）
- 字段标准化与人工确认
- 数据 / 网络 / 身份联合辅助研判
- 业务合理性核查（工单 / 负责人确认）
- Evidence / Checklist / Timeline
- 人工最终结论（HumanReview）
- 案件持久化与历史跟踪
- 操作审计、最近活动与交接说明
- 报告草稿持久化与 DOCX 导出

## 三、v1.2 新增

- `CaseAuditLog` 案件操作审计
- Semantic Command（语义业务动作）
- 操作审计与 Activity Feed
- 最新交接（Handoff Note）
- `lastActivityAt`（与 `updatedAt` / `reportUpdatedAt` 分离）
- 报告创建 / 更新 / 导出审计
- `operationId` 幂等
- stale 防覆盖（案件 snapshot / 报告草稿）

## 四、技术栈

- Next.js（App Router）+ TypeScript + Tailwind CSS
- Prisma ORM 7 + SQLite（本地 Demo）
- Better Auth 1.6.x（username + password；Database Session）
- Vitest
- docx（原生可编辑 Word）

### 开发登录（v1.3 Step 3–4）

`npm run db:seed`（非 production）会幂等创建 Demo Users：

| username | role |
| --- | --- |
| `demo-admin` | ADMIN |
| `demo-analyst` | ANALYST |
| `demo-viewer` | VIEWER |

口令：环境变量 `DEMO_AUTH_PASSWORD`，未设置时使用 `.env.example` 中的 Development-only 默认值。  
**production seed 不会创建 Demo Users。**

说明：页面已要求登录；Case/Report/Activity **Server Authorization 已接入**（Step 4）。  
VIEWER 可查看案件与报告，但写操作与 Word 导出会被服务端拒绝。  
**Trusted Actor / UI RBAC / 用户管理尚未完成**，勿当作完整 v1.3 上线。

## 五、核心流程

```text
已有平台告警
→ Import（手工 / CSV / 文本）
→ Normalization + 人工确认
→ SecurityCase
→ Analysis（静态规则引擎）
→ Checklist / Evidence / Timeline
→ HumanReview
→ Persistence（caseState）
→ Semantic Commands + CaseAuditLog（运营留痕）
→ ReportDraft（独立持久化）
→ DOCX 导出
```

## 六、核心安全设计

- `UNKNOWN ≠ NORMAL`，`UNKNOWN ≠ LOW`（数据不足显示「暂无法评级」）
- 技术异常 ≠ 安全事件（须结合业务上下文）
- `SuggestedAssessment` 与 `HumanReview` 严格分离；系统建议不得覆盖人工结论
- 系统不得自动产生：确认攻击 / 确认失陷 / 确认数据泄露
- Timeline = 安全事件历史；AuditLog = 运营操作历史（不得混淆）

## 七、Audit 局限（重要）

当前**不是**生产级合规审计系统。

原因包括：

- 已有 Login / Session，且 Case/Report Server Action 权限校验已接入；Trusted Actor **尚未**接入
- `MANUAL` actorName 仍不可信为真实身份
- SQLite 本地库
- 无独立审计库
- 无防篡改机制
- 无不可抵赖保证

生产环境需要：强制认证、完整 RBAC、服务端可信 Actor、数据库权限隔离、
集中审计、日志完整性保护、备份与保留策略。

## 八、数据安全说明

- Demo **全部使用虚构 Mock 数据**（私网 / 测试 IP，虚构账号与人员）
- Seed 中所有人员均为虚构 Demo 数据
- **不得**导入真实客户或生产安全日志
- SQLite 仅用于本地 Demo；真实生产需要权限、审计、备份、高可用、
  企业数据库与安全部署评审，不在本 MVP 范围内

## 九、启动方法

```bash
npm install

# 确认 .env（可从 .env.example 复制）
# DATABASE_URL="file:./prisma/dev.db"

npx prisma generate
npx prisma migrate deploy
npm run db:seed

npm run dev
```

常用命令：

```bash
npm test                 # 单元测试
npm run build            # 生产构建
npm run generate:samples # 重新生成 samples/ DOCX
npm run db:seed          # 幂等写入 Case A / Case B（含 Audit）
npm run db:reset-demo    # 清空本地 Demo DB 并重新 migrate + seed（仅本地）
```

> `db:reset-demo` 是本地开发复位工具，**不会**在 Web UI 中提供。

空库验证路径：`migrate deploy` → 无 Audit → `/cases/new` 创建案件 →
自动产生 `CASE_CREATED` → Activity Feed 正常（不依赖 Seed）。

## 十、Demo Flow（约 3～5 分钟）

1. **登录（30 秒）**  
   打开 `/login`，使用 `demo-analyst` + Development Demo 口令进入 `/cases`。  
   说明：不替代 SIEM，只做告警后的研判、案件运营与报告。

2. **Case A（1 分钟）**  
   打开 `INC-20260808-001`：技术异常明显，但业务已授权；人工结论为
   「正常授权业务行为」。可查看 Checklist / 业务上下文 / 已闭环状态 /
   Activity Feed。进入报告中心继续编辑或导出 Word。

3. **Case B（1 分钟）**  
   打开 `INC-20260808-002`：多维异常、业务尚未确认、人工结论「疑似安全事件」。
   可查看最新交接与操作记录。点击「生成报告」→ 修改事件概述 → 保存 → 导出 Word。

4. **新建研判（1 分钟）**  
   `/cases/new` → 文本粘贴 Mock 告警 → 确认 → 创建案件 → 刷新后状态仍在。

5. **报告中心（30 秒）**  
   `/reports` → 继续编辑 / 导出 Word。

## 十一、Demo 案件说明

| 案件 | 编号 | 状态 | 报告 | 结论方向 |
| --- | --- | --- | --- | --- |
| Case A | INC-20260808-001 | 已闭环 | 已预置 reportDraft | 正常授权业务行为 |
| Case B | INC-20260808-002 | 待核查 | 无报告（演示首次生成） | 疑似安全事件 |

Seed 使用固定 `id`（`demo-case-a` / `demo-case-b`）、固定案件编号与稳定
`operationId`（如 `seed:v12:case-a:created`），可重复执行且不重复写入 Audit。

## 十二、合规与约束

开发前必读：[`AGENTS.md`](./AGENTS.md) 与 `docs/`。

| 文档 | 作用 |
| --- | --- |
| [`docs/PRODUCT_BOUNDARY.md`](./docs/PRODUCT_BOUNDARY.md) | 产品边界 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 架构 |
| [`docs/DOMAIN_MODEL.md`](./docs/DOMAIN_MODEL.md) | 领域模型 |
| [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) | 合规 |
| [`docs/ACCEPTANCE_CRITERIA.md`](./docs/ACCEPTANCE_CRITERIA.md) | 验收 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 版本变更 |

## 十三、Future Work / Roadmap

合理后续方向（**不在当前 v1.2.x 稳定系列默认范围**）：

- 认证身份 / RBAC
- PostgreSQL / 企业数据库
- 生产级集中审计与防篡改
- 企业 Word 模板定制
- 更多安全产品字段适配
- 内部系统 / API 对接
- 通知 / 排班 / 多人实时协作

**不作为近期默认方向**：AI 自动判定攻击、自动封禁、自动响应。
