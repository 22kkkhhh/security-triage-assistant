# 项目当前状态

## 当前事实

| 项目 | 值 |
| --- | --- |
| 产品 | 数据与网络安全联合研判及案件运营助手 |
| 当前版本线 | v1.12.0（稳定化基线） |
| 部署形态 | staging：Node 22；Docker 镜像已完成隔离启动与 ready 烟囱验证 |
| 当前地址 | `http://43.139.70.88:3012`（直连 staging） |
| 数据库 | SQLite：`prisma/staging.db`；迁移由生产启动门禁执行 |
| 当前里程碑 | 第一阶段：稳定可用（Release Hardening），并开始第二阶段输入基础能力 |

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

当前 staging 仍为直接 `3012` 端口，不能视为 HTTPS 生产部署；现有 Nginx `80/3013` 入口承载其他服务，未经确认不得改写。

## 第二阶段已开始：告警接入基础

- `CaseRecord.externalAlertId` 已作为可选唯一字段，并提供迁移。
- 明确标注为外部来源（如 Wazuh、Webhook、批量导入）的案件，会按 `externalAlertId` 做幂等去重；重复告警返回已关联案件，不新建案件。
- `MANUAL`、历史演示夹具和未标注来源的内部命令不启用该字段，避免把旧的 `originalAlertId` 误当作外部幂等键。
- 原始告警仍保留在案件状态中；敏感字段脱敏与 JSONL/Webhook 入口将在此基础上继续接入。

## M3 不变量

- Security Evidence 的稳定身份为 `ruleId + actionId`；`label` 和 `actionIndex` 仅用于展示。
- Security Evidence 只有在 checklist 已完成、来源为 `SECURITY_VERIFICATION` 且存在精确 security `suggestionKey` 时才可为 `RESOLVED`。
- `UNKNOWN` 不能被解释为 `NORMAL` 或 `RESOLVED`。
- checklist 完成不等于案件正常；调查进度已解决不等于案件关闭；最终结论由人工确认。
- 报告中的冻结快照不得因后续 runtime 刷新而静默改变。

## 已整合、待审查的接管工作

- C1：`c418140a530e1f921e79b06eb8cf386beaa4937d`，报告冻结引用保护、报告 OCC、业务上下文来源边界、目的地区域 fail-closed、运行时解析失败契约。
- D1：`03bcde8b95115562d3c6aac51edd90246900f5b2`，工作台刷新、命令执行态、报告导航、加载/未找到页面、响应式外壳与基础可访问性。

当前接管分支为 `agent/codex-v1.5-m4-handoff`，仅负责上述整合、项目记忆和状态确认；不在本分支新增 M4 功能。
