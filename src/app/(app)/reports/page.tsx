import Link from "next/link";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { finalConclusionLabels, riskLevelLabels } from "@/domain/labels";
import {
  displayCaseListRisk,
  riskBadgeClass,
} from "@/components/cases/caseDisplay";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { ForbiddenError } from "@/domain/auth";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";
import { requirePermission } from "@/services/auth/requirePermission";
import { listReportCases } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

/**
 * 报告中心：仅列出 hasReport=true 的案件。
 */
export default async function ReportsPage() {
  try {
    await requirePermission("REPORT_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel message="当前账号无权限查看报告中心。" />
      );
    }
    throw error;
  }

  const reports = await listReportCases();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">报告中心</h1>
        <p className="mt-1 text-sm text-neutral-500">
          查看并继续编辑已生成的安全事件调查报告
        </p>
      </header>

      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        {reports.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-medium text-neutral-800">暂无报告</p>
            <p className="mt-2 text-sm text-neutral-500">
              案件生成报告后，可在这里继续编辑或导出 Word。
            </p>
            <Link
              href="/cases"
              className="mt-5 inline-block rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            >
              前往历史案件
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                  <th className="px-4 py-3 font-medium">案件编号</th>
                  <th className="px-4 py-3 font-medium">事件名称</th>
                  <th className="px-4 py-3 font-medium">人工结论</th>
                  <th className="px-4 py-3 font-medium">人工风险等级</th>
                  <th className="px-4 py-3 font-medium" title="仅反映报告草稿最后保存时间">
                    报告更新时间
                  </th>
                  <th className="px-4 py-3 font-medium">操作</th>
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
                            继续编辑
                          </Link>
                          <ReportExportButton caseId={item.id} />
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
    </div>
  );
}
