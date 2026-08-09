# docs/law 来源与权利说明（v1.4 Step 2A）

> 本地 PDF 仅作人工复核与 hash 溯源参考，**不提交进 Git**，也不作为运行时全文灌库来源。  
> 正式入库内容见 `src/services/knowledge/pack/curatedPack.ts`（精选条款 / 摘要）。

## 选定资料（5）

| # | 本地文件名 | canonicalCode | contentMode | rightsStatus | sha256 |
| --- | --- | --- | --- | --- | --- |
| 01 | `01_中华人民共和国网络安全法_2025修正版.pdf` | CN-CSL | FULL_TEXT（精选条款） | PUBLIC | `0e3a212c4414fd097744826d8888068df2ebfd285347d58210e95ab94b37c33d` |
| 02 | `02_中华人民共和国数据安全法_2021.pdf` | CN-DSL | FULL_TEXT（精选条款） | PUBLIC | `44ba4977dbba0e8d8c6c81e352f828e138386ac385c2f73d81233599d7b9a224` |
| 03 | `03_中华人民共和国个人信息保护法_2021.pdf` | CN-PIPL | FULL_TEXT（精选条款） | PUBLIC | `4baa3b32f03d5c025548b87a8e224e0a4eeb874ccfc50f6b58e1c5fe9ed3dcb1` |
| 04 | `04_网络数据安全管理条例_2024.pdf` | CN-NDSL-REGULATION | FULL_TEXT（精选条款） | PUBLIC | `7c51c9b66296db6819bb9ab62c3bc7d60946b36fad6e26f06ee181dbc8292df0` |
| 05 | `05_GBT22239-2019_网络安全等级保护基本要求.pdf` | CN-GBT-22239 | **SUMMARY_ONLY** | **UNKNOWN** | `254ddd75cac3dec755fd1216f7ef4d3fb8552399b376a1590efd060c537298a4` |

## 官方核验入口（公开）

- 法律文本：https://www.npc.gov.cn/
- 行政法规：https://www.gov.cn/
- 国家标准公开系统：https://openstd.samr.gov.cn/

## 复核记录

- reviewedAt：2026-08-09
- 复核结论：
  - 法律 / 条例：可收录**精选**公开条款原文要点，不得全文灌库
  - GB/T 22239：权利未完成再分发确认 → **禁止 FULL_TEXT**；仅 SUMMARY_ONLY 精选要求
  - 所有 Control↔Clause 映射仅为控制支撑 / 可能义务 / 升级触发，**不是违法结论**

## Git 策略

- `docs/law/*.pdf` 已加入 `.gitignore`
- 允许提交：本 `SOURCES.md`、`README.md`
- 禁止提交：标准 / 法规 PDF 二进制全文
