# v1.12 Backup & Restore

附录：SQLite 一致性备份 / 恢复操作。主流程见 [`PRODUCTION_RUNBOOK.md`](./PRODUCTION_RUNBOOK.md)。

## Backup

```bash
# 指定输出文件
npm run db:backup -- --output /backup/security-triage-manual.db

# 或输出到目录（自动命名 security-triage-YYYYMMDD-HHmmss.db）
BACKUP_DIR=/backup npm run db:backup
```

机制：

- SQLite `VACUUM INTO` 一致性快照（非运行中 `fs.copyFile`）
- 完成后 `PRAGMA integrity_check` 必须为 `ok`
- 先写 `.tmp` 再 rename

要求：

- `DATABASE_URL` 为 SQLite `file:`
- 源 DB 文件存在
- 目标 ≠ 源
- 目标目录可写

## Restore（destructive）

**必须先停止应用 / 容器。**

```bash
npm run db:restore -- --backup /backup/security-triage-manual.db --confirm-restore
```

可选高风险跳过安全备份：

```bash
npm run db:restore -- --backup /backup/x.db --confirm-restore --skip-safety-backup
```

默认行为：

1. 校验 backup（SQLite header + integrity + 关键表）
2. 若 live DB 存在 → 先做 pre-restore safety backup
3. staging copy → 替换 live → 清理 `-wal`/`-shm`/`-journal`
4. 再对 live 做 integrity_check

无 `--confirm-restore`：立即失败，不修改 live DB。

## After restore

```bash
npm start   # M1 gate: migrate deploy → readiness → next start
curl -fsS http://127.0.0.1:3000/api/ready
```

较旧但兼容的 backup 可由 `migrate deploy` 向前迁移。

## Docker example

```bash
docker stop sta-app
# backup volume DB (or use npm run db:backup against mounted path)
docker run --rm \
  -e DATABASE_URL=file:/data/security-triage.db \
  -v sta-data:/data \
  -v sta-backup:/backup \
  sta-image \
  npm run db:restore -- --backup /backup/security-triage-manual.db --confirm-restore
docker start sta-app
# wait /api/ready
```

## Non-goals

- 热恢复运行中的 DB
- 只导出 Cases JSON
- PostgreSQL dump
