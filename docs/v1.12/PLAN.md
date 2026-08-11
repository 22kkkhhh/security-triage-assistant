# v1.12 Plan — Deployment & Production Readiness

Theme: **Deployment & Production Readiness**

产品定位保持：**single-node deployment-ready MVP**（不是 Production-ready Enterprise）。

## Milestones

### M1 — Runtime Safety & Reliable Startup

- Unified production env validation
- Migration-before-start gate（`npm start`）
- `/api/health`（liveness）+ `/api/ready`（readiness）
- Minimum security headers
- Production HTTPS / secure-session posture（Better Auth 库默认 + URL 校验）
- Login rate limiting（Better Auth 1.6.26 native）
- `main` branch Verification trigger
- Production runbook v1.12

### M2 — Deployment & Operational Recovery

- Docker / 数据卷约定
- Backup / restore scripts
- Structured operational logging（最小 JSON stdout）
- CSP / 其它运维增强（按证据）

### M3 — Release

- Release readiness、tag、GitHub Release

## Explicit non-goals (v1.12)

Kubernetes、微服务、Redis、Kafka、SIEM、Elasticsearch、OpenTelemetry 平台、PostgreSQL 迁移、多租户、企业 IAM、WAF。
