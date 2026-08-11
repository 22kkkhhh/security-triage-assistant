# v1.12 Plan — Deployment & Production Readiness

Theme: **Deployment & Production Readiness**

产品定位保持：**hardened single-node deployment MVP**（不是 Production-ready Enterprise）。

## Milestones

### M1 — Runtime Safety & Reliable Startup — COMPLETE

- Unified production env validation
- Migration-before-start gate（`npm start`）
- `/api/health` + `/api/ready`
- Minimum security headers
- Production HTTPS / secure-session posture
- Login rate limiting（Better Auth native）
- `main` branch Verification trigger
- Production runbook v1.12

### M2 — Deployment & Operational Recovery — COMPLETE

- Production Dockerfile（non-root、`/data`、复用 `npm start` gate、ready healthcheck）
- Persistent SQLite volume contract
- `VACUUM INTO` backup + integrity check
- Destructive restore（`--confirm-restore`、safety backup、sidecar cleanup）
- Minimal structured operational JSON logs（allowlisted）
- Client import file/text size caps（JSON/CSV/Text）
- WAL/busy_timeout：**documented / deferred**（证据不足不强行 PRAGMA）
- CI Docker production smoke
- Rollback / DR runbook + backup appendix

### M3 — Release

- Release readiness、tag、GitHub Release

## Explicit non-goals (v1.12)

Kubernetes、Compose 编排平台、微服务、Redis、Kafka、SIEM、Elasticsearch、OpenTelemetry 平台、PostgreSQL 迁移、多租户、企业 IAM、WAF、image registry 自动发布。
