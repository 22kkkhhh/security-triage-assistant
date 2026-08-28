import Link from "next/link";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { BatchJsonlImport } from "@/components/import/BatchJsonlImport";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
import { ForbiddenError } from "@/domain/auth";
import { requirePermission } from "@/services/auth/requirePermission";

export default async function BatchImportPage() {
  try {
    await requirePermission("CASE_CREATE");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <ForbiddenPanel title="无权批量导入" message="当前账号无权限创建研判案件。" />;
    }
    throw error;
  }

  return (
    <PageFrame width="normal">
      <PageHeader title="批量导入告警" description="将 Wazuh 或其他安全平台的 JSONL 告警导入案件工作区。" />
      <div className="flex items-center gap-3 text-sm"><Link href="/cases/new" className="text-blue-700 hover:text-blue-800">← 新建单条研判</Link><span className="text-slate-300">|</span><span className="text-slate-500">原始内容仅以脱敏形式留存</span></div>
      <BatchJsonlImport />
    </PageFrame>
  );
}
