import Link from "next/link";

/**
 * App Router 未找到页面（中文、不泄露内部错误）。
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-12 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">未找到页面</h1>
      <p className="text-sm text-neutral-500">
        请求的内容不存在，或当前账号无权访问。
      </p>
      <Link
        href="/cases"
        className="inline-block text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900"
      >
        返回历史案件
      </Link>
    </div>
  );
}
