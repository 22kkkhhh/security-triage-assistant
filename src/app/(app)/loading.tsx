/**
 * App Router 片段加载态（中文、不泄露内部错误）。
 */
export default function AppLoading() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-neutral-500">加载中…</p>
    </div>
  );
}
