import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { ForbiddenError, UnauthenticatedError } from "@/domain/auth";
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
      reason = null;
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#071321] px-4 py-8 sm:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{ backgroundImage: "url('/login-background.png')" }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#071321]/55" />
      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <section className="hidden max-w-xl text-slate-100 lg:block">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-600 text-sm font-bold tracking-wide text-white shadow-lg shadow-blue-950/30">SC</span>
            <div>
              <p className="text-lg font-semibold leading-6 tracking-wide">数据与网络安全联合研判及案件运营助手</p>
              <p className="mt-0.5 text-xs text-slate-400">Security Triage Assistant</p>
            </div>
          </div>
          <div className="mt-20 border-l border-blue-400/40 pl-6">
            <p className="text-sm font-medium tracking-[0.18em] text-blue-300">SECURITY OPERATIONS</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white">从发现异常，到形成<br />可复核的研判结论。</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">统一查看案件、证据与调查报告，让每一次处置都有清晰的上下文和可追溯的下一步。</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-[#f8fbff]/[.97] p-6 shadow-2xl shadow-black/25 sm:p-8">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-xs font-bold tracking-wide text-white">SC</span>
              <div>
                <p className="text-base font-semibold leading-5 text-[#142235]">数据与网络安全联合研判及案件运营助手</p>
                <p className="mt-0.5 text-xs text-[#68788d]">Security Triage Assistant</p>
              </div>
            </div>
          </div>
          <div className="mb-7">
            <p className="text-xs font-medium tracking-[0.16em] text-[#2c6bed]">WELCOME BACK</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#142235]">登录工作台</h2>
            <p className="mt-2 text-sm leading-6 text-[#68788d]">仅授权人员使用，登录后进入案件与报告工作区。</p>
          </div>
          <LoginForm initialReason={reason} />
        </section>
      </div>
    </main>
  );
}
