# v1.12 Release Acceptance

## Theme

Deployment & Production Readiness

定位：**hardened single-node deployment MVP**（不是 fully production-ready enterprise platform）。

## Release candidate

- Branch: `integration/v1.12` → promote `main`
- Previous stable: `main` @ `9b0ccffa439f122af5fc0598c69ccaaa48208432` + tag `v1.11.0`
- M2 complete baseline: `9275f5295ecfe332611478e53725631d0e74302b`
- Final release SHA: M3 release commit（与 annotated tag `v1.12.0` peeled commit 相同）

## Release scope

### M1 — Runtime Safety & Reliable Startup — COMPLETE

- Production env validation（含非 loopback HTTPS 要求）
- SQLite filesystem preflight
- `npm start` migration-before-start gate
- readiness-before-`next start`
- `/api/health`（liveness）+ `/api/ready`（DB/schema）
- Security response headers
- Better Auth secure cookie posture
- Native single-node login rate limiting（无可信 XFF）
- `main` push Verification trigger

### M2 — Deployment & Operational Recovery — COMPLETE

- Production Docker：`node:22-bookworm-slim`、non-root、`/data`、`/backup`
- CMD 复用 `npm start` gate；HEALTHCHECK → `/api/ready`
- `VACUUM INTO` backup + integrity + `.tmp` atomic rename
- Restore：`--confirm-restore`、默认 pre-restore safety backup
- Minimal allowlisted operational JSON logging
- Docker CI smoke（含 invalid-env fail-closed、volume restart）

### M3 — Release Readiness + Closeout — COMPLETE

- Restore stale SQLite sidecar cleanup **fail-closed before live replacement**
- Release docs / README / CHANGELOG / 本文件
- Promote `main` + annotated tag `v1.12.0` + GitHub Release + freeze

## Operational invariants

- migrate-before-start
- ready ≠ health；ready requires DB/schema
- runtime secret ≠ image content
- Docker volume ≠ backup
- backup requires integrity check
- restore requires explicit confirmation
- restore requires application stopped（operator contract；busy probe 仅为 best-effort）
- corrupt backup cannot replace live DB
- stale sidecar cleanup failure cannot return restore success
- single-node ≠ HA
- in-memory limiter ≠ distributed limiter
- production runtime hardening does not change security analysis semantics

## Product invariants (unchanged)

- `UNKNOWN` ≠ `NORMAL`
- `SuggestedAssessment` ≠ `HumanReview`
- ownership ≠ ACL
- `OVERDUE` ≠ HIGH risk
- Viewer readonly

## Final Docker / backup / restore / logger audit

| Area | Status |
|---|---|
| No real secret / `.env` / local DB / git / backup baked into image | Contract + `.dockerignore` + CI smoke |
| Build dummy env build-time only；missing runtime env → non-zero exit | CI invalid-env smoke |
| non-root；`/data` + `/backup` writable | Dockerfile + smoke |
| Backup = `VACUUM INTO` + integrity；≠ volume / Case JSON / Report export | Unit tests |
| Restore confirmation + validate-before-replace + safety backup + sidecar fail-closed | Unit + blocker test |
| Operational logger allowlisted typed events；no arbitrary metadata bag | Unit tests |

## Rate-limit boundary

- Better Auth in-memory limiter：single-process；restart resets；no distributed guarantee
- Without trusted proxy IP：may use shared path-level bucket
- **Not** enabling X-Forwarded-For trust in v1.12
- Public deployments：trusted reverse proxy / network abuse controls recommended
- **No** WAF claim

## SQLite boundary

- single-node SQLite deployment only
- WAL / busy_timeout：**deferred**（no demonstrated need；不强制 PRAGMA）
- No HA / multi-replica / enterprise database / horizontal scaling claims

## Deferred / Known Limitations

- PostgreSQL
- HA / multi-replica
- Kubernetes
- Compose orchestration platform
- Redis
- distributed rate limiting
- trusted proxy IP contract
- CSP nonce/hash
- application HSTS
- WAL / busy_timeout tuning
- Docker image slimming
- GHCR publishing
- automated deployment
- OpenTelemetry platform
- online restore

不承诺下一版交付时间。

## Schema / dependencies / permissions

- Prisma migration：NONE（v1.12）
- Dependency changes：NONE
- Permission changes：NONE

## Release blockers found

- M3：restore 在 sidecar unlink 失败时曾 ignore 并仍可能 success → **已修复**（替换 live 前 fail-closed）

## Non-blockers recorded, not fixed

- `assertNotBusy` rename probe 不能跨平台证明应用已停止（文档边界）
- 公网共享 login throttling 风险（接受；不靠盲目 XFF trust“修复”）
- Image 保留 Prisma/tsx 启动工具链（slimming DEFER）
