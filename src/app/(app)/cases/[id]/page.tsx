import Link from "next/link";
import { getCaseById } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

/**
 * 案件详情占位页（Step 2）。
 * Step 3 将在此接入 Workbench 恢复与自动保存。
 */
export default async function CaseDetailPlaceholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getCaseById(id);

  return (
    <div className="space-y-4">
      <Link
        href="/cases"
        className="inline-block text-sm text-slate-600 hover:text-slate-900"
      >
        ← 返回历史案件
      </Link>
      <div className="rounded-md border border-neutral-200 bg-white px-5 py-6">
        {record ? (
          <>
            <h1 className="text-xl font-semibold text-neutral-900">
              {record.title}
            </h1>
            <p className="mt-2 font-mono text-sm text-neutral-500">
              {record.caseNumber}
            </p>
            <p className="mt-4 text-sm text-neutral-600">
              案件详情工作台将在 Step 3 接入。当前仅确认路由与数据恢复入口可用。
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-neutral-900">案件不存在</h1>
            <p className="mt-2 text-sm text-neutral-600">
              未找到 ID 为 {id} 的案件记录。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
