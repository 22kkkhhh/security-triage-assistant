/**
 * Client 侧 Action 错误文案：优先识别 Auth code，避免模糊成“请重试”。
 */
export function actionErrorMessage(
  result: { error: string; code?: string },
  fallback: string,
): string {
  if (result.code === "UNAUTHENTICATED") {
    return "登录状态已失效，请重新登录";
  }
  if (result.code === "FORBIDDEN") {
    return "当前账号无权限执行此操作";
  }
  return result.error || fallback;
}
