# v1.12 Production Deployment Runbook

本 runbook 描述 **Security Triage Assistant** 的 **single-node deployment-ready MVP** 边界。  
当前版本使用 **SQLite + better-sqlite3**，适合单实例私有化长期运行；**不是**高可用或多实例生产数据库方案。

> 旧文档 `docs/v1.5/PRODUCTION_RUNBOOK.md` 已弃用；请以本文件为准。

## Runtime boundary

- 单 Node 进程：`npm start`（内含 migration gate → `next start`）
- 单文件 SQLite（`DATABASE_URL=file:...`）
- 部署方式：**bare-metal / VM**，使用 `npm ci`（本版本 Prisma CLI 来自 `node_modules`）
- 反向代理负责 TLS 终止与对外 HTTPS；应用侧要求非本机 production origin 使用 `https://` 的 `BETTER_AUTH_URL`
- Login rate limit：Better Auth **单进程内存**限流（重启清零；非分布式）

## 必填环境变量

| 变量 | 说明 |
|---|---|
| `NODE_ENV` | 必须为 `production`（`npm start` 会确保） |
| `BETTER_AUTH_SECRET` | 高熵随机密钥，**至少 32 字符**；不得使用 `.env.example` 占位值 |
| `BETTER_AUTH_URL` | 对外可访问的完整站点 URL（绝对 URL，http/https） |
| `DATABASE_URL` | SQLite `file:` URL；**禁止**省略后回退到 `file:./prisma/dev.db` |

### HTTPS 要求

- 非 loopback production origin：**必须** `https://...`
- 允许本机 smoke / CI：`http://localhost`、`http://127.0.0.1`、`http://[::1]`
- **无** `ALLOW_INSECURE_PRODUCTION` 逃生开关
- HSTS 由反向代理在 TLS 终止处设置（应用不在 HTTP/localhost 上强制 HSTS）

### DATABASE_URL（SQLite）

- production 仅支持 `file:`（当前产品边界；未承诺 PostgreSQL）
- 首次部署允许数据库文件尚不存在：`prisma migrate deploy` 会创建
- 父目录必须存在（或可创建）且可写

### 禁止提交 Secret

- 真实 `BETTER_AUTH_SECRET`、数据库路径、bootstrap 口令 **不得** 进入 Git
- 生产 secret 通过部署平台密钥管理注入

## 部署步骤

### 1. 安装依赖

```bash
npm ci
```

v1.12 single-node bare-metal deployment uses `npm ci`（含 Prisma CLI）。

### 2. 配置环境变量

按上表注入；确认 `BETTER_AUTH_URL` 与浏览器访问 origin 一致。

### 3. Build

```bash
npm run build
```

### 4. Start（含 migration gate）

```bash
npm start
```

正式启动路径（不可跳过）：

```text
validate production env
→ SQLite filesystem preflight
→ prisma migrate deploy
→ schema readiness probe
→ next start
```

任一步失败：stderr 输出 **sanitized** 运维信息，`exit code != 0`，Next **不会**启动。

内部等价命令（勿作为正式运维入口）：`npm run start:next`（绕过 gate，仅调试）。

运维人员 **不必** 记忆「先 migrate 再 start」两条命令。

### 5. Bootstrap 首个 ADMIN

空实例 **不会** 自动创建 Demo 用户：

```bash
npm run user:bootstrap-admin
```

需配置（见 `.env.example`）：`BOOTSTRAP_ADMIN_*`。若已存在 enabled ADMIN，脚本拒绝重复 bootstrap。

## Health / Ready

| Endpoint | 含义 | 成功 | 失败 |
|---|---|---|---|
| `GET /api/health` | Liveness：进程能响应 | `200 {"status":"ok"}` | — |
| `GET /api/ready` | Readiness：DB + 关键 Case schema | `200 {"status":"ready"}` | `503 {"status":"not_ready"}` |

- `Cache-Control: no-store`
- **不要求登录**
- 响应 **不包含** version SHA、DB path、SQL、env、stack
- 进程管理器：liveness → `/api/health`；readiness → `/api/ready`

## Security baseline

应用响应头（`next.config.ts`）：

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

CSP：本版本未启用严格 CSP（避免破坏 Next App Router）；可在反向代理或后续里程碑评估。  
Session cookie：Better Auth 默认 `httpOnly` + `SameSite=Lax`；`Secure` 随 `https://` baseURL。

### Login rate limit

- Better Auth 原生限流；production 默认启用；内存存储
- `/sign-in*` 等敏感路径使用库内特殊规则（短窗口、低次数）
- **不信任**未配置信任的 `X-Forwarded-For`（避免伪造 IP 绕过）
- 单进程；重启清零；非分布式
- UI 继续使用通用登录失败文案，不泄漏账号是否存在

## 禁止在生产使用

- `npm run db:reset-demo`（production 立即拒绝）
- `.env.example` 占位 secret / Demo 口令作为真实凭据
- 依赖 localhost fallback 的对外 `BETTER_AUTH_URL`
- 多实例写同一 SQLite 文件

## SQLite 运营边界

- 单文件、单节点；无主从
- 备份（M1 仅流程，脚本见 M2）：**升级前停止写入并备份 DB 文件**（及 `-wal`/`-shm` 若存在）
- 恢复：停止服务 → 替换文件 → 启动 → 检查 `/api/ready`

## Startup failure 排查顺序

`npm start` 非零退出时，按顺序检查：

1. **env** — `NODE_ENV` / secret / URL / `DATABASE_URL`
2. **filesystem** — SQLite 父目录存在且可写
3. **migrate deploy** — migration 失败或 Prisma CLI 不可用
4. **DB/schema readiness** — schema 陈旧或数据库不可用

常见 sanitized 信息：

- `production env validation failed`
- `database filesystem preflight failed`
- `database migration failed`
- `readiness failed: ...`

不以 Prisma 原始异常作为唯一运维指导；响应与 stderr 不打印 secret / 完整 `DATABASE_URL` / 案件正文。

## Rollback skeleton（M1 文档；备份脚本 M2）

1. 升级前：停止应用 → 备份 SQLite 文件  
2. 部署新版本 → `npm ci` → `npm run build` → `npm start`  
3. 确认 `/api/ready` = ready  
4. 失败：停止应用 → 还原 DB 备份 → 切回上一 tag 构建产物 → `npm start` → 再验 ready  

## 验证清单

1. `/api/health` → 200 ok  
2. `/api/ready` → 200 ready  
3. `/login` 可访问；bootstrap ADMIN 可登录  
4. Case list / detail 可加载  
5. 错误 env / 不可写目录时 `npm start` 非零退出且 Next 未监听  
6. `BETTER_AUTH_URL` 与浏览器 origin 一致  

## 相关文档

- `docs/v1.12/PLAN.md`
- `docs/v1.5/KNOWN_ENVIRONMENT_ISSUES.md` — Windows Prisma 本地已知问题（CI 为准）
