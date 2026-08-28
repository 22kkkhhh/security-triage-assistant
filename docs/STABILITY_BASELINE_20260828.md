# 第一阶段稳定性基线（2026-08-28）

## 已验证

- 版本线统一为 `v1.12.0`，Node.js `v22.23.2`。
- staging 当前以生产启动门禁运行在 `3012`，`/api/health` 与 `/api/ready` 均返回 200。
- `npm test`：102 个测试文件、970 个测试全部通过。
- `npm run test:e2e`：Phase 1 的 23 个测试、Phase 2 的 1 个 fail-closed 测试全部通过；使用独立 `prisma/e2e.db`。
- `npm run typecheck`、`npm run lint`、`npm run build` 全部通过。
- 新增 JSONL 批量导入、原始告警脱敏存储与 `RawAlertRecord` 迁移；新增 3 个边界单元测试后，`npm test` 为 104 个测试文件、973 个测试全部通过，`typecheck` 与 `lint` 通过。
- SQLite 停服备份：`/home/hermes/backups/security-triage-staging-20260828.db`，完整性为 `ok`。
- 备份恢复到临时数据库成功，8 个 Prisma migrations 无待执行项；未修改 `prisma/staging.db`。
- 运行日志为结构化 JSON；未发现 secret、密码或告警原文写入启动日志。
- 已配置并验证腾讯云 Docker Hub 内网镜像源 `https://mirror.ccs.tencentyun.com`。
- Node 22 镜像 `security-triage-assistant:v1.12.0-staging` 已按最新提交重建成功（镜像 ID `ba26885308d1`，约 388 MiB）。
- 使用 staging 备份副本在隔离端口 `3122` 启动容器：`/api/health` 与 `/api/ready` 均返回 200；8 个迁移无待执行。
- 隔离容器重启后用户数（3）与案件数（2）保持不变；缺少生产密钥时启动退出码为 1，fail-closed 生效。
- 外部告警去重已在隔离 SQLite 上验证：相同 `externalAlertId` 的第二次外部创建返回已关联案件，不新增记录；手工来源不启用该去重键。
- 维护窗口已完成容器接管演练：最新镜像正式监听 `3012`，`/login`、`/api/health`、`/api/ready` 均通过，Docker health 为 `healthy`。
- 回滚演练已完成：停止容器、恢复切换前 SQLite 备份并启动 bare-metal，三项检查均通过；随后再次切回容器并保持运行。
- 试点导入 10 条脱敏 Wazuh 公共格式样例，回滚后案件总数仍为 12（原有 2 条 + 试点 10 条）。
- 新增迁移 `20260828160000_add_raw_alert_records` 已在隔离 SQLite 和正式 staging 数据库部署并完成 seed/启动验证；增量镜像 `security-triage-assistant:v1.12.0-staging-raw-alerts`（ID `9993ffa59356`）已接管 3012。
- 真实浏览器烟囱测试：管理员登录 `/cases/import`，同一 Wazuh-shaped JSONL 连续两条返回 1 条 CREATED + 1 条 DUPLICATE；数据库 `RawAlertRecord` 两条均保存，`password` 字段为 `[REDACTED]`。

## 当前部署边界

- staging：Node 22 Docker 容器 `sta-v12-live`，直连 `http://43.139.70.88:3012`。
- 容器数据卷：`/home/hermes/docker-data/security-triage-v12`；当前 bare-metal 回滚备份保留在 `/home/hermes/backups/`。
- Nginx 当前 `3013 → 127.0.0.1:4750`，80/443 未作为本项目入口；未经确认不得改写。

## 阻塞项

- Docker 构建已解除 Docker Hub 拉取阻塞；Debian 软件源下载速度较慢，后续可评估腾讯云 APT 镜像或预构建依赖以缩短构建时间。
- 已完成一次容器接管、回滚和再次接管；后续切换仍需沿用维护窗口、回滚点和端口验收流程。
- 构建期间按确认回收 9 个本次失败构建产生的悬空层，根分区从 98% 降至 78%；未触碰运行容器、数据库卷或备份。
- HTTPS 需要确认域名、证书来源和公网流量切换窗口；当前不做猜测性改动。

## 下一步

1. 在维护窗口执行容器接管演练：备份 → 隔离端口验收 → 端口切换 → 回滚演练。
2. 补齐容器切换后的登录、案件读取/写入、报告导出烟囱测试记录。
3. 保持 HTTP 内网边界；未来若开放公网，再单独确认域名、证书、密钥保管和 HTTPS 切换方案。
4. 在 JSONL 试点基础上继续接入 Webhook 签名校验、Wazuh/堡垒机/数据库审计适配与原始告警检索界面。
