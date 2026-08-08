import Link from "next/link";

/**
 * 新建研判占位页（Step 2）。
 * Step 3 将在此接入现有 ImportFlow，并在确认后创建持久化案件。
 */
export default function NewCasePlaceholderPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">新建研判</h1>
      <div className="rounded-md border border-neutral-200 bg-white px-5 py-6">
        <p className="text-sm text-neutral-700">
          导入流程将在后续步骤接入。当前请从历史案件列表验证搜索与筛选功能。
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          请勿在 Demo 环境导入真实生产安全日志或客户敏感数据。
        </p>
        <Link
          href="/cases"
          className="mt-5 inline-block rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          返回历史案件
        </Link>
      </div>
    </div>
  );
}
