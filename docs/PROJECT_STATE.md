# 项目当前状态

## 当前事实

| 项目 | 值 |
| --- | --- |
| 产品 | Security Triage Assistant（数据与网络安全联合研判及报告助手） |
| 当前版本线 | v1.5 |
| 集成分支 | `integration/v1.5` |
| 最近冻结里程碑 | v1.5.0-m3 |
| M3 tag commit | `8545567190400de1fa0a555017c30e6d1baa7975` |
| 当前里程碑 | M4 Release Hardening |

## 里程碑

- M1：已验收。
- M2：已验收。
- M3：已验收；不重新设计其核心语义。
- M4：进行中。

## M3 不变量

- Security Evidence 的稳定身份为 `ruleId + actionId`；`label` 和 `actionIndex` 仅用于展示。
- Security Evidence 只有在 checklist 已完成、来源为 `SECURITY_VERIFICATION` 且存在精确 security `suggestionKey` 时才可为 `RESOLVED`。
- `UNKNOWN` 不能被解释为 `NORMAL` 或 `RESOLVED`。
- checklist 完成不等于案件正常；调查进度已解决不等于案件关闭；最终结论由人工确认。
- 报告中的冻结快照不得因后续 runtime 刷新而静默改变。

## 已整合、待审查的接管工作

- C1：`c418140a530e1f921e79b06eb8cf386beaa4937d`，报告冻结引用保护、报告 OCC、业务上下文来源边界、目的地区域 fail-closed、运行时解析失败契约。
- D1：`03bcde8b95115562d3c6aac51edd90246900f5b2`，工作台刷新、命令执行态、报告导航、加载/未找到页面、响应式外壳与基础可访问性。

当前接管分支为 `agent/codex-v1.5-m4-handoff`，仅负责上述整合、项目记忆和状态确认；不在本分支新增 M4 功能。
