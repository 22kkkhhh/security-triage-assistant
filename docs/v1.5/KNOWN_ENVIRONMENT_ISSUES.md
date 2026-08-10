# 已知开发环境问题

## Windows：Prisma Schema Engine 在 Node 子进程中的启动失败

### 现象

在当前 Windows 开发主机上（Node 24.16.0、Prisma 7.9.1），普通环境执行
`npm test` 时，多个数据库测试套件会在 `prisma migrate deploy` 的测试
bootstrap 阶段失败。调用方是 Node 子进程，Prisma 仅返回
`Schema engine error`；测试断言尚未开始执行。

这是本机环境特有的已知阻塞项，不应通过跳过数据库测试、降低断言，或在
默认测试命令中注入 Prisma 诊断变量来掩盖。

### 干净环境证据

GitHub Actions 的独立 Ubuntu Runner 在 Node 22.23.1、Prisma 7.9.1 下从零执行
`npm ci`、`prisma generate`、`prisma validate`、lint、typecheck、全量测试和 build，
全部通过：57/57 个测试文件、582/582 个测试。

对应运行：[Verification #31356314108](https://github.com/22kkkhhh/security-triage-assistant/actions/runs/31356314108)
（提交 `c06b31be8009bcc006563fc8d5604021941b0cd7`）。该运行没有设置
`RUST_LOG` 或任何 Prisma debug/diagnostic 环境变量。

### 处理原则

- `RUST_LOG=debug` 仅可用于问题诊断，不得作为正式测试、CI 或开发默认
  workaround。
- 在本机问题未单独解决前，仓库门禁以该干净环境验证为准；继续保留所有
  数据库测试及其现有 migration 语义。
- 若重新调查 Windows 问题，应单独记录 Node、Prisma、OS 与子进程调用证据，
  不修改 Prisma schema 或 migration 作为猜测性修复。
