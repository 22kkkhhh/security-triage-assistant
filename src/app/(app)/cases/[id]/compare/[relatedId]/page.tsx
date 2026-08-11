import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import {
  CaseComparisonBackLink,
  CaseComparisonPanel,
} from "@/components/cases/CaseComparisonPanel";
import { ForbiddenError } from "@/domain/auth";
import { requirePermission } from "@/services/auth/requirePermission";
import { loadCaseComparison } from "@/services/correlation/loadCaseComparison";

export const dynamic = "force-dynamic";

/**
 * 两案对比调查：纯只读 Server Page。
 * 不写入 Case / Audit / Checklist / lastActivityAt。
 */
export default async function CaseComparePage({
  params,
}: {
  params: Promise<{ id: string; relatedId: string }>;
}) {
  try {
    await requirePermission("CASE_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel message="当前账号无权限查看案件对比。" />
      );
    }
    throw error;
  }

  const { id, relatedId } = await params;
  const result = await loadCaseComparison(id, relatedId);

  if (result.status === "NOT_FOUND") {
    notFound();
  }

  const { comparison } = result;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <CaseComparisonBackLink currentCaseId={id} />
      <header>
        <h1 className="text-lg font-semibold text-neutral-900">
          案件对比调查
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          只读对比 · 不自动继承历史结论 · 不修改当前案件
        </p>
      </header>
      <CaseComparisonPanel comparison={comparison} />
    </div>
  );
}
