import { notFound } from "next/navigation";
import { PersistedReportEditor } from "@/components/report/PersistedReportEditor";
import { getOrCreateReportDraft } from "@/services/persistence/reportDraftService";

export const dynamic = "force-dynamic";

/**
 * 报告编辑页：
 * - reportDraft 已存在 → 直接加载，绝不 rebuild
 * - 不存在 → 首次 buildReportData 并持久化
 */
export default async function CaseReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let bundle;
  try {
    bundle = await getOrCreateReportDraft(id);
  } catch {
    throw new Error("报告初稿生成失败，请重试。");
  }
  if (!bundle) {
    notFound();
  }

  return <PersistedReportEditor bundle={bundle} />;
}
