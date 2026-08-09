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
import { loadCaseComplianceWorkbenchViews } from "@/services/knowledge/loadCaseCompliancePanel";
import { getCaseById } from "@/services/persistence/caseRepository";
import { restoreWorkbenchFromPersisted } from "@/services/persistence/restoreWorkbench";

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

  const initial = restoreWorkbenchFromPersisted(record);
  const [auditPage, latestHandoff, complianceViews] = await Promise.all([
    listCaseAuditLogs({ caseId: id, limit: 40 }),
    getLatestHandoffNote(id),
    loadCaseComplianceWorkbenchViews(record),
  ]);
  const capabilities = buildCaseWorkbenchCapabilities(user);

  return (
    <PersistedCaseWorkbench
      initial={initial}
      hasReport={record.hasReport}
      capabilities={capabilities}
      compliancePanel={complianceViews.panel}
      complianceChecklist={complianceViews.checklist}
      initialAudit={{
        items: auditPage.items,
        nextCursor: auditPage.nextCursor,
        hasMore: auditPage.hasMore,
        latestHandoff,
      }}
    />
  );
}
