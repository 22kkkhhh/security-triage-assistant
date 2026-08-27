# 第一阶段稳定性基线（2026-08-28）

## 已验证

- 版本线统一为 `v1.12.0`，Node.js `v22.23.2`。
- staging 当前以生产启动门禁运行在 `3012`，`/api/health` 与 `/api/ready` 均返回 200。
- `npm test`：102 个测试文件、970 个测试全部通过。
- `npm run test:e2e`：Phase 1 的 23 个测试、Phase 2 的 1 个 fail-closed 测试全部通过；使用独立 `prisma/e2e.db`。
- `npm run typecheck`、`npm run lint`、`npm run build` 全部通过。
- SQLite 停服备份：`/home/hermes/backups/security-triage-staging-20260828.db`，完整性为 `ok`。
- 备份恢复到临时数据库成功，7 个 Prisma migrations 无待执行项；未修改 `prisma/staging.db`。
- 运行日志为结构化 JSON；未发现 secret、密码或告警原文写入启动日志。

## 当前部署边界

- staging：Node 22 bare-metal，直连 `http://43.139.70.88:3012`。
- Nginx 当前 `3013 → 127.0.0.1:4750`，80/443 未作为本项目入口；未经确认不得改写。
- 当前没有运行中的 Docker 容器。

## 阻塞项

- Docker 构建因服务器访问 Docker Hub 超时失败：无法拉取 `node:22-bookworm-slim`；不是项目编译错误。
- 要完成 Docker 切换，需要明确可信的腾讯云/内网镜像地址，或恢复 Docker Hub 出网访问。
- HTTPS 需要确认域名、证书来源和公网流量切换窗口；当前不做猜测性改动。
- 当前服务器 .env 的 BETTER_AUTH_URL 仍为公网 HTTP，因此默认生产 build 会按门禁失败；使用临时 loopback HTTPS 参数验证通过，切换前必须配置真实 HTTPS。

## 下一步

1. 配置并验证可信镜像源，构建 Node 22 镜像。
2. 使用 staging 数据库副本在隔离端口启动容器，验证 `/api/ready`、重启持久化和 invalid-env fail-closed。
3. 明确域名/证书/密钥保管方案后，再设计 Nginx HTTPS 切换。
4. 完成一次生产烟囱测试后，才进入第二阶段真实数据源适配。
