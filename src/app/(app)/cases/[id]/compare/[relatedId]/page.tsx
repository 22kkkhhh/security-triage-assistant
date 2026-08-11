import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import {
  CaseComparisonBackLink,
  CaseComparisonPanel,
} from "@/components/cases/CaseComparisonPanel";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
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
    <PageFrame width="wide">
      <PageHeader
        title="案件对比调查"
        description="只读对比 · 不自动继承历史结论 · 不修改当前案件"
        back={<CaseComparisonBackLink currentCaseId={id} />}
      />
      <CaseComparisonPanel comparison={comparison} />
    </PageFrame>
  );
}
