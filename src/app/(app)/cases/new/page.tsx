import { NewCaseClient } from "@/components/cases/NewCaseClient";

/**
 * 新建研判：ImportFlow → 人工确认 → createCase → /cases/[id]。
 */
export default function NewCasePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">新建研判</h1>
        <p className="mt-1 text-sm text-neutral-500">
          导入现有安全平台告警或日志摘要，并在确认标准化字段后创建研判案件。
        </p>
      </header>
      <NewCaseClient />
    </div>
  );
}
