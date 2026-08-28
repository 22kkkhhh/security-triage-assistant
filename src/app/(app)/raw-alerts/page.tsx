import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
import { RawAlertList } from "@/components/intake/RawAlertList";
import { ForbiddenError } from "@/domain/auth";
import { requirePermission } from "@/services/auth/requirePermission";

export default async function RawAlertsPage() {
  try { await requirePermission("CASE_READ"); }
  catch (error) { if (error instanceof ForbiddenError) return <ForbiddenPanel title="无权查看原始告警" message="当前账号无权读取案件数据。" />; throw error; }
  return <PageFrame width="normal"><PageHeader title="原始告警" description="查询已接收告警的来源、去重和脱敏留存状态。" /><RawAlertList /></PageFrame>;
}
