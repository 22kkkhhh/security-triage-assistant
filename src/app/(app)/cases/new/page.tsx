import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { NewCaseClient } from "@/components/cases/NewCaseClient";
import { ForbiddenError } from "@/domain/auth";
import { requirePermission } from "@/services/auth/requirePermission";

/**
 * 新建研判：ImportFlow → 人工确认 → createCase → /cases/[id]。
 * VIEWER 直接访问 → Forbidden（已登录，不 redirect /login）。
 */
export default async function NewCasePage() {
  try {
    await requirePermission("CASE_CREATE");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel
          title="无权新建研判"
          message="当前账号无权限创建研判案件。"
        />
      );
    }
    throw error;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">新建研判</h1>
        <p className="mt-1 text-sm text-neutral-500">
          导入现有安全平台告警或日志摘要，并在确认标准化字段后创建研判案件。
        </p>
      </header>
      <NewCaseClient />
    </div>
  );
}
