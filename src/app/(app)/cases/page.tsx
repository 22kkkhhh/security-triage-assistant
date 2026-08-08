import Link from "next/link";
import { caseStatusLabels, riskLevelLabels } from "@/domain/labels";
import type { CaseStatus, RiskLevel } from "@/domain/types";
import {
  displayCaseListRisk,
  displayCaseStatus,
  displaySystems,
  displayUpdatedAt,
  riskBadgeClass,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
import { listCases } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  risk?: string;
}>;

const statusOptions = Object.entries(caseStatusLabels) as [CaseStatus, string][];
const riskOptions = Object.entries(riskLevelLabels) as [RiskLevel, string][];

/**
 * 历史案件列表（Server Component）。
 * 搜索与筛选通过 GET searchParams 传递给 listCases，不在客户端过滤。
 */
export default async function CasesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = isCaseStatus(params.status) ? params.status : undefined;
  const risk = isRiskLevel(params.risk) ? params.risk : undefined;

  const cases = await listCases({
    search: q || undefined,
    status,
    riskLevel: risk,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">历史案件</h1>
          <p className="mt-1 text-sm text-neutral-500">
            查看并继续处理已保存的安全研判案件
          </p>
        </div>
        <Link
          href="/cases/new"
          className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          + 新建研判
        </Link>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3"
      >
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="text-neutral-500">搜索</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索案件编号 / 事件名称 / 账号 / IP / 系统"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-neutral-500">状态</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 block rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-neutral-500">风险等级</span>
          <select
            name="risk"
            defaultValue={risk ?? ""}
            className="mt-1 block rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">全部风险</option>
            {riskOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          搜索
        </button>
      </form>

      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        {cases.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-medium text-neutral-800">暂无历史案件</p>
            <p className="mt-2 text-sm text-neutral-500">
              创建第一个研判案件后，可在这里继续处理。
            </p>
            <Link
              href="/cases/new"
              className="mt-5 inline-block rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            >
              + 新建研判
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                  <th className="px-4 py-3 font-medium">案件编号</th>
                  <th className="px-4 py-3 font-medium">事件名称</th>
                  <th className="px-4 py-3 font-medium">风险</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">涉及账号</th>
                  <th className="px-4 py-3 font-medium">涉及系统</th>
                  <th className="px-4 py-3 font-medium">待核查</th>
                  <th className="px-4 py-3 font-medium">最近更新</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => {
                  const riskLabel = displayCaseListRisk(
                    item.humanRiskLevel,
                    item.suggestedRiskLevel,
                  );
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50"
                      style={{ height: 52 }}
                    >
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link
                          href={`/cases/${item.id}`}
                          className="text-slate-800 underline-offset-2 hover:underline"
                        >
                          {item.caseNumber}
                        </Link>
                      </td>
                      <td className="max-w-[240px] px-4 py-2">
                        <Link
                          href={`/cases/${item.id}`}
                          className="line-clamp-2 text-neutral-900 underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs ${riskBadgeClass(riskLabel)}`}
                        >
                          {riskLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs ${statusBadgeClass(item.status)}`}
                        >
                          {displayCaseStatus(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-neutral-700">
                        {item.username ?? "—"}
                      </td>
                      <td className="max-w-[180px] px-4 py-2 text-neutral-700">
                        <span className="line-clamp-2">
                          {displaySystems(item.systemsSearchText)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-neutral-700">
                        {item.pendingChecklistCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-neutral-600">
                        {displayUpdatedAt(item.updatedAt)}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/cases/${item.id}`}
                          className="text-sm text-slate-800 underline-offset-2 hover:underline"
                        >
                          继续研判
                        </Link>
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

function isCaseStatus(value: string | undefined): value is CaseStatus {
  return (
    value === "NEW" ||
    value === "INVESTIGATING" ||
    value === "PENDING_VERIFICATION" ||
    value === "PENDING_BUSINESS_CONFIRMATION" ||
    value === "RESPONDING" ||
    value === "CLOSED"
  );
}

function isRiskLevel(value: string | undefined): value is RiskLevel {
  return (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "CRITICAL"
  );
}
