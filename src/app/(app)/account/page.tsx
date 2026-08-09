import { AccountPasswordForm } from "@/components/account/AccountPasswordForm";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { ForbiddenError } from "@/domain/auth";
import { requirePermission } from "@/services/auth/requirePermission";

/**
 * 账户：自助修改密码。三角色均有 PASSWORD_SELF_CHANGE。
 */
export default async function AccountPage() {
  try {
    await requirePermission("PASSWORD_SELF_CHANGE");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel
          title="无权修改密码"
          message="当前账号无权限修改密码。"
        />
      );
    }
    throw error;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">账户</h1>
        <p className="mt-1 text-sm text-neutral-500">
          修改本人登录密码。不会显示或管理其他用户。
        </p>
      </header>
      <AccountPasswordForm />
    </div>
  );
}
