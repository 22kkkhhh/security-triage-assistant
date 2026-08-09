/**
 * 已登录但无权限时的服务端页面提示（与未登录 redirect /login 区分）。
 */
export function ForbiddenPanel({
  title = "无权访问",
  message = "当前账号无权限执行此操作。",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-6 py-10">
      <h1 className="text-lg font-semibold text-amber-950">{title}</h1>
      <p className="mt-2 text-sm text-amber-900">{message}</p>
    </div>
  );
}
