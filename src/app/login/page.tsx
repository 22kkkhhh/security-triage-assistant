import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  ForbiddenError,
  UnauthenticatedError,
} from "@/domain/auth";
import { auth } from "@/lib/auth";
import { requireAuthenticatedUser } from "@/services/auth/currentUser";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  let reason = params.reason ?? null;

  try {
    await requireAuthenticatedUser();
    redirect("/cases");
  } catch (error) {
    // redirect() 通过抛错实现，必须继续抛出
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (error instanceof ForbiddenError) {
      await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
      reason = "disabled";
    } else if (!(error instanceof UnauthenticatedError)) {
      // InvalidAuthUserStateError 等：fail closed，展示登录页
      reason = null;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-md rounded-md border border-neutral-200 bg-white px-8 py-10 shadow-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-neutral-900">
            Security Triage Assistant
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            数据与网络安全联合研判及报告助手
          </p>
          <p className="mt-4 text-xs text-neutral-500">仅授权人员使用</p>
        </div>
        <LoginForm initialReason={reason} />
      </div>
    </div>
  );
}
