import { notFound } from "next/navigation";
import { PersistedCaseWorkbench } from "@/components/cases/PersistedCaseWorkbench";
import { getCaseById } from "@/services/persistence/caseRepository";
import { restoreWorkbenchFromPersisted } from "@/services/persistence/restoreWorkbench";

export const dynamic = "force-dynamic";

/**
 * 案件工作台入口：服务端加载 caseState → 重新分析 → 合并 Checklist → 客户端可编辑并自动保存。
 * 刷新或直接访问 /cases/[id] 均可完整恢复。
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

  return (
    <PersistedCaseWorkbench initial={initial} hasReport={record.hasReport} />
  );
}
