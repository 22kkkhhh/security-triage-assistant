# 架构约束

## 处理流水线

```text
输入层
↓
Normalizer
↓
SecurityCase
↓
Analysis Engines
├─ Data Risk
├─ Network Context
└─ Identity Behavior
↓
Correlation
↓
Evidence + Checklist
↓
Human Review
↓
Timeline
↓
Report Builder
↓
DOCX Generator
```

V1 为单体 Web 应用，不允许拆微服务。

---

## 技术栈（固定）

除非出现明确技术障碍并经批准，否则不得自行更换：

| 层级 | 技术 |
| --- | --- |
| Web 框架 | Next.js |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| UI 组件 | shadcn/ui |
| 数据库 | SQLite |
| ORM | Prisma |
| 校验 | Zod |
| CSV 解析 | PapaParse |
| Word 导出 | docx |

---

## 代码结构

```text
src/
  domain/
  services/
    normalization/
    analysis/
    evidence/
    checklist/
    reporting/
  components/
  app/
```

要求：

- 业务逻辑与 UI 分离
- 分析引擎位于 `services/analysis`
- 报告构建与 DOCX 导出位于 `services/reporting`
- MVP 优先可读、可测试、可演示

---

## 明确禁止

禁止为了“架构漂亮”制造：

- 无意义抽象
- 多层 Repository
- 微服务接口
- CQRS
- Event Sourcing
- 复杂设计模式
- Kafka / Redis / Elasticsearch / Kubernetes（V1）
