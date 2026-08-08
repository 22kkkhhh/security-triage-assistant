import { notFound } from "next/navigation";
import { PersistedCaseWorkbench } from "@/components/cases/PersistedCaseWorkbench";
import {
  getLatestHandoffNote,
  listCaseAuditLogs,
} from "@/services/persistence/auditRepository";
import { getCaseById } from "@/services/persistence/caseRepository";
import { restoreWorkbenchFromPersisted } from "@/services/persistence/restoreWorkbench";

export const dynamic = "force-dynamic";

/**
 * 案件工作台入口：服务端加载 caseState → 重新分析 → 合并 Checklist → 客户端可编辑并自动保存。
 * 同时预加载操作审计第一页与最新交接（不写 Audit、不改 lastActivityAt）。
 */
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getCaseById(id);
  if (!record) {
    notFound();
  }

  const initial = restoreWorkbenchFromPersisted(record);
  const [auditPage, latestHandoff] = await Promise.all([
    listCaseAuditLogs({ caseId: id, limit: 40 }),
    getLatestHandoffNote(id),
  ]);

  return (
    <PersistedCaseWorkbench
      initial={initial}
      hasReport={record.hasReport}
      initialAudit={{
        items: auditPage.items,
        nextCursor: auditPage.nextCursor,
        hasMore: auditPage.hasMore,
        latestHandoff,
      }}
    />
  );
}
