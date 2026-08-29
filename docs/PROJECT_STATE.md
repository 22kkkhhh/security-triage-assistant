# 项目当前状态

## 当前事实

| 项目 | 值 |
| --- | --- |
| 产品 | 数据与网络安全联合研判及案件运营助手 |
| 当前版本线 | v1.12.0（稳定化基线，main @ `4bcddb2`） |
| 部署形态 | main：Node 22 Docker；3012 直连 HTTP；3133 候选预览已停止 |
| 当前地址 | `http://43.139.70.88:3012`（内网直连 HTTP） |
| 数据库 | SQLite：`prisma/staging.db`；迁移由生产启动门禁执行 |
| 当前里程碑 | 第一阶段：稳定可用（Release Hardening）已完成，进入第二阶段试点准备 |

## 里程碑

- M1：已验收。
- M2：已验收。
- M3：已验收；不重新设计其核心语义。
- M4：稳定化基线已完成，进入真实业务试点准备。

## 第一阶段状态（2026-08-28）

- [x] Node 22 运行时已用于 staging，生产 Dockerfile 已存在并使用 Node 22。
- [x] 构建、TypeScript、lint、ready 检查可重复通过。
- [x] 登录页、工作台和浏览器标题已统一产品名称与设计规范。
- [x] Docker 镜像在隔离端口完成启动、健康检查、ready、重启恢复和迁移检查。
- [x] 备份数据库副本完成隔离恢复验证；恢复后用户与案件数据保持一致。
- [x] 缺少生产密钥时启动门禁按预期 fail-closed。
- [ ] Nginx/HTTPS/密钥/日志的生产入口方案完成确认后再切换公网流量。

当前 `3012` 仍为直接 HTTP 端口，不能视为 HTTPS 公网部署；现有 Nginx `80/3013` 入口承载其他服务，未经确认不得改写。

## Main 集成与 3012 验收（2026-08-30）

- 候选分支 `codex/case-detail-ux-consolidation` 已通过 GitHub Verification（verify、docker-smoke），并以 fast-forward 方式合并到 `main`。
- main 当前提交为 `4bcddb2003fe338c1dc73002d745fe7558dfe99a`；未使用 force push、squash 或历史重写。
- 3012 已切换至 `security-triage-assistant:main-4bcddb2`，保留原 `/data` 与备份卷；旧容器保留为 `sta-v12-live-before-main-6493020` 以便回滚。
- 生产健康检查：`/api/health`、`/api/ready` 均通过；公网登录页返回 HTTP 200。
- 使用 Demo 管理员完成浏览器验收：Overview → 案件队列 → 案件详情 → 调查/实体面板 → 时间线 → Evidence → 原始告警详情/脱敏载荷 → 关联案件对比 → 报告查看。
- 本次未重复执行数据库备份演练；现有数据库数据卷未更换、未清理。

## 第二阶段已开始：告警接入基础

- `CaseRecord.externalAlertId` 已作为可选唯一字段，并提供迁移。
- 明确标注为外部来源（如 Wazuh、Webhook、批量导入）的案件，会按 `externalAlertId` 做幂等去重；重复告警返回已关联案件，不新建案件。
- 原始告警支持按来源、接入状态和 `externalAlertId` 查询；列表行可进入权限保护的详情页，详情仅展示已脱敏副本，载荷默认折叠且不提供下载。
- `MANUAL`、历史演示夹具和未标注来源的内部命令不启用该字段，避免把旧的 `originalAlertId` 误当作外部幂等键。
- 新增 `RawAlertRecord`：每次 JSONL 告警先递归脱敏（password/token/authorization/cookie 等）再保存，重复到达也保留接收记录并关联既有案件。
- 新增 `/cases/import` JSONL 批量导入页：最多 100 条、总计 1 MB，复用 Wazuh 适配器和现有案件创建/审计/去重命令；已发布到 staging 并完成登录、创建/重复、脱敏留存烟囱测试。

## M3 不变量

- Security Evidence 的稳定身份为 `ruleId + actionId`；`label` 和 `actionIndex` 仅用于展示。
- Security Evidence 只有在 checklist 已完成、来源为 `SECURITY_VERIFICATION` 且存在精确 security `suggestionKey` 时才可为 `RESOLVED`。
- `UNKNOWN` 不能被解释为 `NORMAL` 或 `RESOLVED`。
- checklist 完成不等于案件正常；调查进度已解决不等于案件关闭；最终结论由人工确认。
- 报告中的冻结快照不得因后续 runtime 刷新而静默改变。

## 已整合、待审查的接管工作

- C1：`c418140a530e1f921e79b06eb8cf386beaa4937d`，报告冻结引用保护、报告 OCC、业务上下文来源边界、目的地区域 fail-closed、运行时解析失败契约。
- D1：`03bcde8b95115562d3c6aac51edd90246900f5b2`，工作台刷新、命令执行态、报告导航、加载/未找到页面、响应式外壳与基础可访问性。

当前主线为 `main`（`4bcddb2003fe338c1dc73002d745fe7558dfe99a`）；C1/D1 内容已纳入稳定化基线，后续变更应继续复用现有领域模型与权限边界。
