# v1.12 Production Deployment Runbook

本 runbook 描述 **Security Triage Assistant** 的 **hardened single-node deployment MVP** 边界。
当前版本使用 **SQLite + better-sqlite3**，适合单实例私有化长期运行；**不是**高可用 / 多实例 / Enterprise production-ready 平台。

> 旧文档 `docs/v1.5/PRODUCTION_RUNBOOK.md` 已弃用；请以本文件为准。
> Backup/restore 细节：[`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md)

## Runtime boundary

- 单 Node 进程：`npm start`（env → filesystem → migrate → ready → Next）
- 单文件 SQLite（推荐 `DATABASE_URL=file:/data/security-triage.db`）
- 部署方式：
  - **bare-metal / VM**：`npm ci` → `npm run build` → `npm start`
  - **Docker**：见下文（镜像含 Prisma CLI / tsx，因当前 start gate 需要）
- 反向代理负责 TLS；非本机 production origin 必须 `https://` BETTER_AUTH_URL
- Login rate limit：Better Auth 单进程内存限流（无可信 proxy IP 时可能退化为共享 path bucket）

## 必填环境变量

| 变量 | 说明 |
|---|---|
| `NODE_ENV` | `production`（`npm start` 会确保） |
| `BETTER_AUTH_SECRET` | ≥32 字符高熵；禁止 `.env.example` 占位值 |
| `BETTER_AUTH_URL` | 绝对 URL；非 loopback production 必须 https |
| `DATABASE_URL` | SQLite `file:`；禁止省略后回退 `dev.db` |

### Secret recovery

`BETTER_AUTH_SECRET` 是 deployment secret，**不会**写入 DB backup。
完整 DR 需要：DB backup **+** 外部保管的 secret。丢失 secret 可能影响既有 session 行为。

## Bare-metal deploy

```bash
npm ci
npm run build
# 注入生产 env
npm start
npm run user:bootstrap-admin   # 仅空实例；显式一步，非自动
```

v1.12 single-node deployment intentionally uses `npm ci`（含 migration/start tooling）。

## Docker deploy

### Build

```bash
docker build -t security-triage-assistant:local .
```

Build 阶段仅使用 **dummy** auth/db 值编译 Next；**不得**把真实 secret 作为 ARG/ENV 烘焙进镜像。

### Run

```bash
docker volume create sta-data
docker volume create sta-backup

docker run -d --name sta-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e BETTER_AUTH_SECRET='<high-entropy-secret>' \
  -e BETTER_AUTH_URL='https://triage.example.com' \
  -e DATABASE_URL='file:/data/security-triage.db' \
  -v sta-data:/data \
  -v sta-backup:/backup \
  security-triage-assistant:local
```

合同：

- 非 root 用户运行
- 持久化目录：`/data`（DB）、`/backup`（备份）
- `CMD` = `npm start`（复用 M1 gate，禁止绕过为 `next start`）
- `HEALTHCHECK` → `GET /api/ready`
- **不**自动创建 ADMIN；bootstrap 仍为显式 operator 步骤
- Docker volume **≠** backup；卷存活不能替代备份

### Invalid env

缺少/非法 env 时容器必须非零退出（M1 fail-closed）。

## Health / Ready

| Endpoint | 含义 |
|---|---|
| `GET /api/health` | Liveness |
| `GET /api/ready` | Readiness（DB + 关键 Case schema） |

容器健康以 **/api/ready** 为准。

## Backup / Restore

见 [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md)。

摘要：

```bash
npm run db:backup -- --output /backup/security-triage-manual.db
# stop app first
npm run db:restore -- --backup /backup/security-triage-manual.db --confirm-restore
npm start
```

## Rollback

**before deploy**

1. 停止写入 / 停应用（推荐）
2. `npm run db:backup` → 记录 backup 路径
3. 记录当前 image tag / git SHA

**deploy**

1. 部署新 image/tag
2. `npm start`（含 migrate）
3. 确认 `/api/ready`

**failure before migration**

- 切回上一 image/tag 启动即可

**failure after schema migration**

1. 停止应用
2. restore **升级前** DB backup（`--confirm-restore`）
3. 切回上一 image/tag
4. `npm start` → `/api/ready`

禁止：回退应用代码却继续使用已 forward-migrated DB 并假装一定安全。

## Disaster recovery checklist

- [ ] 最新 known-good backup + integrity ok
- [ ] 应用 image/tag 已知
- [ ] `BETTER_AUTH_SECRET` 可从外部 secret store 取回
- [ ] `DATABASE_URL` / `/data` 目标正确
- [ ] bootstrap 凭据 **不能**替代 DB 内用户/会话数据

恢复顺序：restore DB → 正确 app 版本 → `npm start`（必要时 forward migrate）→ ready → 登录 → Case / Report / Audit 抽查。

## Security baseline

- Headers：nosniff / Referrer-Policy / X-Frame-Options DENY / Permissions-Policy
- CSP / HSTS：CSP 未强制；HSTS 由反向代理设置
- 不信任未配置的 `X-Forwarded-For`（M1）；公网需反代/网络层 abuse 防护
- 当前内存登录限流在无可信 IP 时可能共享 bucket → 临时全局限流；**不**通过盲目信任转发头“修复”；WAF DEFER

## Operational logs

启动/备份/恢复/限流/授权拒绝输出 **一行 JSON**（stdout/stderr），allowlisted 字段：

`timestamp` / `level` / `event` / `component` / `status` + 少量可选 `permission`/`role`/`stage`/`reason`

不记录：secret、DATABASE_URL、username/password、caseState、告警原文。

`/api/ready` 成功不刷日志；启动 gate 记录一次 readiness_success。

## SQLite WAL / busy_timeout

证据（M2）：默认 `journal_mode` / `busy_timeout` 在当前 Prisma adapter + 既有并发测试下可工作。
**本轮不强制** `PRAGMA journal_mode=WAL` / `busy_timeout`（DOCUMENT / DEFER），避免未充分验证的备份兼容性风险。
single-node + 停服备份 / `VACUUM INTO` 为当前合同。

## Import resource caps

浏览器侧 JSON / CSV / 文本粘贴共享约 1 MiB 上限。Server Action 仍接收结构化字段（非 raw multipart upload）；未新增假的 server raw-CSV 限制。

## Startup failure 排查

1. env
2. filesystem（`/data` 可写）
3. migrate deploy
4. readiness

## 禁止生产使用

- `db:reset-demo`
- Demo 口令 / placeholder secret
- 多实例共写同一 SQLite 文件
- 把 ephemeral 容器层当作唯一 backup 位置

## 相关文档

- `docs/v1.12/PLAN.md`
- `docs/v1.12/BACKUP_RESTORE.md`
- `docs/v1.5/KNOWN_ENVIRONMENT_ISSUES.md`
