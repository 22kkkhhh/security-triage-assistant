import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { CreateReportPanel } from "@/components/report/CreateReportPanel";
import { PersistedReportEditor } from "@/components/report/PersistedReportEditor";
import { ForbiddenError } from "@/domain/auth";
import { buildReportPageCapabilities } from "@/domain/uiCapabilities";
import { requirePermission } from "@/services/auth/requirePermission";
import { loadReportPage } from "@/services/persistence/reportDraftService";

export const dynamic = "force-dynamic";

/**
 * 报告页：
 * - reportDraft 已存在 → 加载编辑器/只读查看，绝不 rebuild
 * - 不存在 → 显式生成入口或 Viewer 只读说明（GET 无创建副作用）
 */
export default async function CaseReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let user;
  try {
    user = await requirePermission("REPORT_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel message="当前账号无权限查看报告。" />
      );
    }
    throw error;
  }

  const { id } = await params;
  const loaded = await loadReportPage(id);
  const capabilities = buildReportPageCapabilities(user);

  if (loaded.status === "not_found") {
    notFound();
  }

  if (loaded.status === "no_report") {
    return (
      <CreateReportPanel
        caseId={loaded.caseId}
        caseNumber={loaded.caseNumber}
        title={loaded.title}
        canWrite={capabilities.canWrite}
      />
    );
  }

  return (
    <PersistedReportEditor bundle={loaded.bundle} capabilities={capabilities} />
  );
}
