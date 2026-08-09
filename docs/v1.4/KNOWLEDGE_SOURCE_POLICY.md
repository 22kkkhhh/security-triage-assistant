# v1.4 知识来源与权利策略

> Knowledge Source Policy  
> 目标：保证知识包可审计、可再分发边界清晰、禁止未知版权全文入库。

---

## 1. 原则

1. **官方来源优先**（政府公报、主管部门官网、正式发布文本）  
2. **版本可追溯**（文号、施行日期、来源 URL、文件 hash）  
3. **权利不明则降级**（SUMMARY_ONLY / METADATA_ONLY + 外链）  
4. **外部规则 ≠ 可执行规则**（必须 License + Context + Adaptation + Tests）  
5. **人工 review 后才能 PUBLISHED**  
6. **禁止**把未知版权 PDF/全文 commit 进仓库

---

## 2. 文档来源字段（强制）

每个 `ComplianceDocumentVersion` 发布前必须具备：

| 字段 | 要求 |
| --- | --- |
| sourceType | OFFICIAL_PUBLIC / USER_PROVIDED / LICENSED / OTHER |
| rightsStatus | PUBLIC / USER_AUTHORIZED / LICENSED / UNKNOWN |
| contentMode | 与 rights 一致 |
| sourceUrl | 尽量填写官方 URL |
| versionLabel / effectiveDate | 可追溯版本 |
| sourceFileHash | 若存在本地源文件则必填 sha256 |
| reviewedAt | 人工复核时间 |

---

## 3. 权利门禁（Fail Closed）

| rightsStatus | 允许 contentMode | 允许 originalText |
| --- | --- | --- |
| PUBLIC | FULL_TEXT / SUMMARY / METADATA | 是（若 FULL_TEXT） |
| USER_AUTHORIZED | 按授权范围 | 仅授权范围内 |
| LICENSED | 按许可证条款 | 仅许可允许 |
| UNKNOWN | METADATA_ONLY 或 SUMMARY_ONLY | **否** |

国家标准 / 商业标准 / 第三方汇编：

- 默认按 **UNKNOWN 或 LICENSED** 处理  
- 未完成法律/合规确认前：**不得 FULL_TEXT 入库**  
- UI 以摘要 + 官方外链为主

内部制度（INTERNAL_POLICY）：

- `USER_PROVIDED` + `USER_AUTHORIZED`  
- v1.4.0 若纳入 demo，仅使用虚构/脱敏样例，禁止真实企业制度入库

---

## 4. Curated Knowledge Pack（v1.4.0）

格式建议：仓库内受控数据（JSON/YAML/TS）+ import CLI。

Pack 清单必须包含：

- document + version 元数据  
- clauses（受 contentMode 约束）  
- controls + mappings  
- 每条映射的 reviewStatus  
- 来源 URL 与复核记录（可放 `SOURCES.md`）

**不做：** 通用 PDF/DOCX 上传中心、OCR、运行时 AI 抽取。

---

## 5. 第一批文档 Selection Criteria（不在本 Step 导入）

目标规模：

- **3–5** 份核心文件  
- **约 20–30** 条精选 Clause（不是全文灌库）

候选类别（选题，非承诺清单）：

1. 数据安全相关法律要点  
2. 个人信息保护相关法律要点  
3. 网络安全相关法律/办法要点  
4. 网络数据安全管理相关要点  
5. 个人信息保护合规审计相关指南要点（若权利允许）

入选条件：

- 与现有 DATA/NETWORK/IDENTITY/BUSINESS 研判强相关  
- 能为 Case B demo 提供 3–6 条可解释关联  
- 来源 URL 可公开核验  
- 权利允许摘要或有限条款引用  

落选/降级：

- 全文权利不清的国家标准 PDF  
- 与当前 Context 无关的宽泛条款堆砌  

---

## 6. 开源检测规则策略

```text
Candidate (Sigma/Splunk/Elastic/…)
  → License Review
  → Context Compatibility（SUPPORTED / NEEDS_CONTEXT / OUT_OF_SCOPE）
  → Adaptation 为 INTERNAL executable TS rule
  → Unit Tests
  → SecurityRuleMetadata + provenance
  → 进入可运行集（仅 SUPPORTED + license OK）
```

禁止：

- 直接执行第三方 DSL  
- 批量 copy 规则库进产品  
- 无 attribution / license 的 adapted 规则标记为内置可运行

Provenance 必填（外部规则）：

`sourceType, upstreamRuleId, upstreamVersion, sourceUrl, licenseId, licenseUrl, attribution, adaptationNote`

---

## 7. AI 内容策略

| 允许（未来） | 禁止（任何版本默认） |
| --- | --- |
| 草稿摘要建议 | AI 输出直接 PUBLISHED |
| mapping 建议 | AI 覆盖 originalText |
| 相关性解释草稿 | 核心引擎硬依赖外部 AI API |

v1.4.0：**核心流程零 AI 依赖**。

---

## 8. 仓库卫生

禁止提交：

- 真实企业内部制度全文  
- 未知版权标准全文 PDF  
- 含敏感数据的「客户合规包」  

允许：

- 虚构 INTERNAL_POLICY demo  
- 指向官方 URL 的元数据  
- 权利清晰的精选条款文本（经复核）  
