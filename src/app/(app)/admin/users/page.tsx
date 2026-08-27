import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { PageHeader } from "@/components/layout/PageHeader";
import { ForbiddenError, UnauthenticatedError } from "@/domain/auth";
import { listManagedUsers } from "@/services/auth/userAdminService";
import { requirePermission } from "@/services/auth/requirePermission";

/**
 * 用户管理：内部运营工具。安全边界为 USER_ADMIN Server Authorization。
 */
export default async function AdminUsersPage() {
  try {
    await requirePermission("USER_ADMIN");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel
          title="无权访问用户管理"
          message="当前账号无权限管理用户。"
        />
      );
    }
    if (error instanceof UnauthenticatedError) {
      throw error;
    }
    throw error;
  }

  const listed = await listManagedUsers({ page: 1 });

  return (
    <div className="space-y-5">
      <PageHeader
        title="用户管理"
        description="创建账号、调整显示名称与角色、启停用户，以及管理员重置密码。用户创建后用户名与邮箱不可修改；不提供物理删除。"
      />
      <AdminUsersClient
        initialUsers={listed.items}
        initialEnabledAdminCount={listed.enabledAdminCount}
      />
    </div>
  );
}
