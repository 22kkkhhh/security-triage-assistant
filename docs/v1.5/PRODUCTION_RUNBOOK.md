# v1.5 Production Deployment Runbook

本 runbook 描述 **Security Triage Assistant MVP** 的生产部署边界。当前版本使用 **SQLite + better-sqlite3**，适合单实例 Demo / 小规模私有化；**不是**高可用或多实例生产数据库方案。

## 必填环境变量

| 变量 | 说明 |
|---|---|
| `NODE_ENV` | 必须为 `production` |
| `BETTER_AUTH_SECRET` | 高熵随机密钥，**至少 32 字符**；不得使用 `.env.example` 占位值 |
| `BETTER_AUTH_URL` | 对外可访问的完整站点 URL（含 scheme + host + port） |
| `DATABASE_URL` | 生产数据库连接；**禁止**省略后回退到 `file:./prisma/dev.db` |

### 禁止提交 Secret

- 真实 `BETTER_AUTH_SECRET`、数据库路径、bootstrap 口令 **不得** 进入 Git
- 仅提交 `.env.example` 占位说明
- 生产 secret 通过部署平台密钥管理注入

### BETTER_AUTH_SECRET 要求

- 长度 ≥ 32
- **不得** 使用仓库示例：`replace-with-a-high-entropy-secret-at-least-32-chars`
- 启动时 fail-closed：配置错误会阻止应用 boot

### DATABASE_URL 要求

- **development / test**：可继续使用 `file:./prisma/dev.db` 等本地 fallback
- **production**：必须显式配置；缺失或空白会导致 startup failure
- 当前 MVP 仍为 SQLite；**不要求** PostgreSQL，也**未**在本轮迁移

## 部署步骤

### 1. 安装依赖

```bash
npm ci
```

### 2. Prisma generate / migrate

```bash
npx prisma generate
npx prisma migrate deploy
```

### 3. Build

```bash
npm run build
```

### 4. Start

```bash
npm run start
```

默认监听 `3000`。如需绑定 `0.0.0.0`，使用平台/进程管理器配置（例如 `HOSTNAME=0.0.0.0` 或反向代理）。

### 5. Bootstrap 首个 ADMIN

空实例 **不会** 自动创建 Demo 用户。使用一次性脚本：

```bash
npm run user:bootstrap-admin
```

需配置（见 `.env.example`）：

- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`
- `BOOTSTRAP_ADMIN_PASSWORD`

若已存在 enabled ADMIN，脚本会拒绝重复 bootstrap。

## 禁止在生产使用

### `npm run db:reset-demo`

该命令会 destructive 清空数据库并重新 seed Case A/B Demo 数据。

- **production 下会立即拒绝退出**
- 不会删除 DB 文件、不会 truncate、不会 migrate reset、不会 seed
- Web UI **不提供** 此能力

本地开发复位见 README；生产数据变更应走备份/恢复流程。

## SQLite MVP 边界

- 单文件数据库，适合单节点部署
- 无内置主从/连接池；多实例写同一 SQLite 文件 **不支持**
- 备份：**文件级复制备份必须先停止服务，或明确冻结所有写入。** 停止应用后复制 `DATABASE_URL` 指向的 `.db` 文件（及同目录 `-wal`/`-shm` 若存在）。若需在线备份，须使用 SQLite 官方支持的可靠 online-backup 方法（如 `.backup` 命令）；**不得**将「低流量窗口」视为安全备份条件。
- 恢复：停止服务 → 替换文件 → 启动服务 → 验证 migrate 状态

## Demo-only 配置

以下 **不得** 用于 production：

- `.env.example` 中的 `DEMO_AUTH_PASSWORD`
- `db:reset-demo`
- 依赖 localhost fallback 的 `BETTER_AUTH_URL`

Production seed **不会** 创建 demo-admin / demo-analyst / demo-viewer。

## Windows 本地已知问题

Windows 开发机上 Prisma Schema Engine 在 Node 子进程 bootstrap 阶段可能失败（见 `docs/v1.5/KNOWN_ENVIRONMENT_ISSUES.md`）。

- **不得** 使用 `RUST_LOG` 作为正式 workaround
- 仓库 release gate 以 **GitHub Actions Ubuntu CI** 为准
- 本地 Windows 问题不降低 CI 断言标准

## 验证清单

部署后至少确认：

1. `/login` 可访问
2. bootstrap ADMIN 可登录
3. Case list / detail 可加载
4. `BETTER_AUTH_URL` 与浏览器访问 origin 一致
5. 未配置 placeholder secret / 缺失 `DATABASE_URL` 时进程无法启动

## 相关文档

- `docs/v1.5/M4_PLAN.md` — M4 硬化计划
- `docs/v1.5/M4_BACKEND_AUDIT.md` — 发布审计
- `docs/v1.5/KNOWN_ENVIRONMENT_ISSUES.md` — Windows Prisma 阻塞项
