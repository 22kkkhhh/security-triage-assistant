import Link from "next/link";

/**
 * 报告中心占位页（Step 2）。
 * Step 5 将实现已生成报告案件的列表与导出入口。
 */
export default function ReportsPlaceholderPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-neutral-900">报告中心</h1>
      <div className="rounded-md border border-neutral-200 bg-white px-5 py-6">
        <p className="text-sm text-neutral-700">
          报告中心功能将在 Step 5 实现。当前仅保留导航入口。
        </p>
        <Link
          href="/cases"
          className="mt-5 inline-block rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          前往历史案件
        </Link>
      </div>
    </div>
  );
}
