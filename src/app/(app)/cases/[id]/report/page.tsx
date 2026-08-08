import { notFound } from "next/navigation";
import { CreateReportPanel } from "@/components/report/CreateReportPanel";
import { PersistedReportEditor } from "@/components/report/PersistedReportEditor";
import { loadReportPage } from "@/services/persistence/reportDraftService";

export const dynamic = "force-dynamic";

/**
 * 报告编辑页：
 * - reportDraft 已存在 → 加载编辑器，绝不 rebuild
 * - 不存在 → 展示显式生成入口（GET 无创建副作用）
 */
export default async function CaseReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const loaded = await loadReportPage(id);

  if (loaded.status === "not_found") {
    notFound();
  }

  if (loaded.status === "no_report") {
    return (
      <CreateReportPanel
        caseId={loaded.caseId}
        caseNumber={loaded.caseNumber}
        title={loaded.title}
      />
    );
  }

  return <PersistedReportEditor bundle={loaded.bundle} />;
}
