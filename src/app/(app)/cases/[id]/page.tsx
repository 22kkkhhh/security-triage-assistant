import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { PersistedCaseWorkbench } from "@/components/cases/PersistedCaseWorkbench";
import { ForbiddenError } from "@/domain/auth";
import { buildCaseWorkbenchCapabilities } from "@/domain/uiCapabilities";
import { requirePermission } from "@/services/auth/requirePermission";
import {
  getLatestHandoffNote,
  listCaseAuditLogs,
} from "@/services/persistence/auditRepository";
import { loadCaseDetailPageData } from "@/app/(app)/cases/loadCaseDetailPageData";
import { loadRelatedCasesForCase } from "@/services/correlation/loadRelatedCases";
import { getCaseById } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

/**
 * 案件工作台入口：服务端加载 caseState → 重新分析 → 合并 Checklist。
 * UI 写控件由 Server 派生 capability 控制；安全边界仍是 Server Authorization。
 */
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let user;
  try {
    user = await requirePermission("CASE_READ");
    await requirePermission("ACTIVITY_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel message="当前账号无权限查看此案件或活动记录。" />
      );
    }
    throw error;
  }

  const { id } = await params;
  const record = await getCaseById(id);
  if (!record) {
    notFound();
  }

  const [{ initial, runtimeViews }, auditPage, latestHandoff, relatedCases] =
    await Promise.all([
      loadCaseDetailPageData(record),
      listCaseAuditLogs({ caseId: id, limit: 40 }),
      getLatestHandoffNote(id),
      loadRelatedCasesForCase(record),
    ]);
  const capabilities = buildCaseWorkbenchCapabilities(user);

  return (
    <PersistedCaseWorkbench
      initial={initial}
      hasReport={record.hasReport}
      capabilities={capabilities}
      compliancePanel={runtimeViews.compliance.panel}
      complianceChecklist={runtimeViews.compliance.checklist}
      complianceResolutionStatus={runtimeViews.complianceResolutionStatus}
      investigationProgress={runtimeViews.investigationProgress}
      relatedCases={relatedCases}
      initialAudit={{
        items: auditPage.items,
        nextCursor: auditPage.nextCursor,
        hasMore: auditPage.hasMore,
        latestHandoff,
      }}
    />
  );
}
