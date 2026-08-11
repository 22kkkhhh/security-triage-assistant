import Link from "next/link";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { caseStatusLabels, riskLevelLabels } from "@/domain/labels";
import type { CaseStatus, RiskLevel } from "@/domain/types";
import {
  displayCaseStatus,
  displaySystems,
  displayUpdatedAt,
  resolveCaseListRiskDisplay,
  riskBadgeClass,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
import { actionClass } from "@/components/layout/pageChrome";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
import { ForbiddenError } from "@/domain/auth";
import { buildNavigationCapabilities } from "@/domain/uiCapabilities";
import { requirePermission } from "@/services/auth/requirePermission";
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
  let user;
  try {
    user = await requirePermission("CASE_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <ForbiddenPanel message="当前账号无权限查看案件列表。" />
      );
    }
    throw error;
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = isCaseStatus(params.status) ? params.status : undefined;
  const risk = isRiskLevel(params.risk) ? params.risk : undefined;
  const { canCreateCase } = buildNavigationCapabilities(user);

  const cases = await listCases({
    search: q || undefined,
    status,
    riskLevel: risk,
  });

  return (
    <PageFrame width="normal">
      <PageHeader
        title="历史案件"
        description={
          canCreateCase
            ? "查看并继续处理已保存的安全研判案件"
            : "查看已保存的安全研判案件（只读）"
        }
        actions={
          canCreateCase ? (
            <Link href="/cases/new" className={actionClass.primary}>
              + 新建研判
            </Link>
          ) : null
        }
      />

      <form
        method="get"
        className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:flex-wrap sm:items-end"
        data-testid="case-list-filters"
      >
        <label className="min-w-0 flex-1 text-sm sm:min-w-[240px]">
          <span className="text-xs font-medium text-neutral-600">搜索</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="案件编号 / 事件名称 / 账号 / IP / 系统"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-neutral-600">状态</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm sm:w-auto"
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
          <span className="text-xs font-medium text-neutral-600">风险</span>
          <select
            name="risk"
            defaultValue={risk ?? ""}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm sm:w-auto"
          >
            <option value="">全部风险</option>
            {riskOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={actionClass.secondary}>
          搜索
        </button>
      </form>

      {cases.length === 0 ? (
        <div className="py-14 text-center" data-testid="case-list-empty">
          <p className="text-base font-medium text-neutral-800">暂无案件</p>
          <p className="mt-1 text-sm text-neutral-500">
            {canCreateCase
              ? "创建第一个研判案件后，可在这里继续处理。"
              : "当前账号为只读访问，暂无可见案件。"}
          </p>
          {canCreateCase ? (
            <Link
              href="/cases/new"
              className={`mt-4 ${actionClass.primary}`}
            >
              + 新建研判
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {/* Desktop / tablet：主列精简；账号与系统并入案件单元格 */}
          <div className="hidden overflow-hidden border border-neutral-200 bg-white md:block">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500">
                  <th className="px-4 py-3">案件</th>
                  <th className="px-4 py-3">风险</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">待核查</th>
                  <th className="px-4 py-3">最近活动</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => {
                  const risk = resolveCaseListRiskDisplay(
                    item.humanRiskLevel,
                    item.suggestedRiskLevel,
                  );
                  const systems = displaySystems(item.systemsSearchText);
                  const secondary = [item.username, systems]
                    .filter((part) => part && part !== "—")
                    .join(" · ");
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                      data-testid="case-list-row"
                    >
                      <td className="max-w-[360px] px-4 py-3">
                        <Link
                          href={`/cases/${item.id}`}
                          className="block min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                        >
                          <span className="font-mono text-xs text-slate-700">
                            {item.caseNumber}
                          </span>
                          <span className="mt-0.5 block text-[14px] font-medium leading-5 text-neutral-900">
                            {item.title}
                          </span>
                          {secondary ? (
                            <span className="mt-0.5 block truncate text-xs text-neutral-500">
                              {secondary}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-xs ${riskBadgeClass(risk.riskLabel)}`}
                          data-testid="case-list-risk"
                          data-risk-source={risk.source}
                        >
                          {risk.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-xs ${statusBadgeClass(item.status)}`}
                        >
                          {displayCaseStatus(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-neutral-700">
                        {item.pendingChecklistCount > 0
                          ? `${item.pendingChecklistCount} 待核查`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-600">
                        {displayUpdatedAt(item.lastActivityAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile：紧凑行，避免横向滚动宽表 */}
          <ul
            className="divide-y divide-neutral-200 border border-neutral-200 bg-white md:hidden"
            data-testid="case-list-mobile"
          >
            {cases.map((item) => {
              const risk = resolveCaseListRiskDisplay(
                item.humanRiskLevel,
                item.suggestedRiskLevel,
              );
              const systems = displaySystems(item.systemsSearchText);
              const secondary = [item.username, systems]
                .filter((part) => part && part !== "—")
                .join(" · ");
              return (
                <li key={item.id}>
                  <Link
                    href={`/cases/${item.id}`}
                    className="block px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-400"
                    aria-label={`${item.caseNumber} ${item.title}`}
                  >
                    <div className="font-mono text-xs text-slate-700">
                      {item.caseNumber}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-neutral-900">
                      {item.title}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-xs ${riskBadgeClass(risk.riskLabel)}`}
                        data-testid="case-list-risk"
                        data-risk-source={risk.source}
                      >
                        {risk.text}
                      </span>
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-xs ${statusBadgeClass(item.status)}`}
                      >
                        {displayCaseStatus(item.status)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-neutral-500">
                      {item.pendingChecklistCount > 0
                        ? `${item.pendingChecklistCount} 待核查`
                        : "无待核查"}
                      {" · "}
                      最近 {displayUpdatedAt(item.lastActivityAt)}
                    </div>
                    {secondary ? (
                      <div className="mt-0.5 truncate text-xs text-neutral-500">
                        {secondary}
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PageFrame>
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
