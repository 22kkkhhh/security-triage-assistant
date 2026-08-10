"use client";

/**
 * 根错误边界：只展示稳定中文文案。
 * 禁止渲染 error.message / stack / digest 等内部细节。
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="mx-auto max-w-lg space-y-3 px-4 py-12 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">
            当前无法完成处理
          </h1>
          <p className="text-sm text-neutral-500">
            请刷新后重试；若持续出现，请联系系统管理员。
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
