import Link from "next/link";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { NewCaseClient } from "@/components/cases/NewCaseClient";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
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
    <PageFrame width="normal">
      <PageHeader
        title="新建研判"
        description="导入现有安全平台告警或日志摘要，并在确认标准化字段后创建研判案件。"
      />
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-600">需要一次导入多条告警？</span>
        <Link href="/cases/import" className="font-medium text-blue-700 hover:text-blue-800">使用 JSONL 批量导入 →</Link>
      </div>
      <NewCaseClient />
    </PageFrame>
  );
}
