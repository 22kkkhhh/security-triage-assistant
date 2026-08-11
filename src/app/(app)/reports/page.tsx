import Link from "next/link";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { finalConclusionLabels, riskLevelLabels } from "@/domain/labels";
import {
  displayCaseListRisk,
  riskBadgeClass,
} from "@/components/cases/caseDisplay";
import { actionClass } from "@/components/layout/pageChrome";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { ForbiddenError } from "@/domain/auth";
import { buildReportPageCapabilities } from "@/domain/uiCapabilities";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { requirePermission } from "@/services/auth/requirePermission";
import { listReportCases } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

/**
 * 报告中心：仅列出 hasReport=true 的案件。
 * 导出/编辑文案由 Server 派生 capability 控制（UX）。
 */
export default async function ReportsPage() {
  let user;
  try {
    user = await requirePermission("REPORT_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel message="当前账号无权限查看报告中心。" />
      );
    }
    throw error;
  }

  const reports = await listReportCases();
  const capabilities = buildReportPageCapabilities(user);

  return (
    <PageFrame width="normal">
      <PageHeader
        title="报告中心"
        description={
          capabilities.canWrite
            ? "查看并继续编辑已生成的安全事件调查报告"
            : "查看已生成的安全事件调查报告（只读）"
        }
      />

      <section className="overflow-hidden border border-neutral-200 bg-white">
        {reports.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-medium text-neutral-800">暂无报告</p>
            <p className="mt-1 text-sm text-neutral-500">
              案件生成报告后，可在这里继续编辑或导出 Word。
            </p>
            <Link href="/cases" className={`mt-4 ${actionClass.secondary}`}>
              前往历史案件
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500">
                  <th className="px-4 py-3">案件编号</th>
                  <th className="px-4 py-3">事件名称</th>
                  <th className="px-4 py-3">人工结论</th>
                  <th className="px-4 py-3">人工风险等级</th>
                  <th className="px-4 py-3" title="仅反映报告草稿最后保存时间">
                    报告更新时间
                  </th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((item) => {
                  const conclusion = item.humanConclusion
                    ? finalConclusionLabels[item.humanConclusion]
                    : "—";
                  const riskLabel = item.humanRiskLevel
                    ? riskLevelLabels[item.humanRiskLevel]
                    : displayCaseListRisk(null, null);
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50"
                      style={{ height: 52 }}
                    >
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link
                          href={`/cases/${item.id}/report`}
                          className="text-slate-800 underline-offset-2 hover:underline"
                        >
                          {item.caseNumber}
                        </Link>
                      </td>
                      <td className="max-w-[240px] px-4 py-2">
                        <Link
                          href={`/cases/${item.id}/report`}
                          className="line-clamp-2 text-neutral-900 underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-700">{conclusion}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs ${riskBadgeClass(riskLabel)}`}
                        >
                          {riskLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-neutral-600">
                        {formatDateTimeForDisplay(
                          item.reportUpdatedAt ?? item.updatedAt,
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/cases/${item.id}/report`}
                            className="text-sm text-slate-800 underline-offset-2 hover:underline"
                          >
                            {capabilities.canWrite ? "继续编辑" : "查看报告"}
                          </Link>
                          <ReportExportButton
                            caseId={item.id}
                            canExport={capabilities.canExport}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageFrame>
  );
}
