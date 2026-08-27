import Link from "next/link";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { EmptyState } from "@/components/ui/EmptyState";
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
import { ForbiddenError, hasPermission } from "@/domain/auth";
import {
  formatOperationalDueLabel,
  isCaseQueueSort,
  type CaseQueueSort,
} from "@/domain/caseDueDate";
import {
  formatCaseAssigneeLabel,
  isCaseQueueScope,
  type CaseQueueScope,
} from "@/domain/caseOwnership";
import { buildNavigationCapabilities } from "@/domain/uiCapabilities";
import { requirePermission } from "@/services/auth/requirePermission";
import { listCases } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  risk?: string;
  scope?: string;
  sort?: string;
}>;

const statusOptions = Object.entries(caseStatusLabels) as [CaseStatus, string][];
const riskOptions = Object.entries(riskLevelLabels) as [RiskLevel, string][];

function queueHref(params: {
  scope: CaseQueueScope;
  sort: CaseQueueSort;
  q: string;
  status?: CaseStatus;
  risk?: RiskLevel;
}): string {
  const sp = new URLSearchParams();
  if (params.scope !== "all") sp.set("scope", params.scope);
  if (params.sort !== "recent") sp.set("sort", params.sort);
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.risk) sp.set("risk", params.risk);
  const qs = sp.toString();
  return qs ? `/cases?${qs}` : "/cases";
}

/**
 * 案件队列（Server Component）。
 * 搜索 / 筛选 / scope / sort 通过 GET searchParams 传给 listCases，不在客户端过滤。
 * Ownership ≠ ACL：CASE_READ 仍可查看全部可见案件。
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
  const requestedScope = isCaseQueueScope(params.scope) ? params.scope : "all";
  /** 无 CASE_ASSIGN 时不展示「我的/未分配」（避免永远为空的无效 scope） */
  const canUseQueueScopes = hasPermission(user, "CASE_ASSIGN");
  const scope: CaseQueueScope = canUseQueueScopes ? requestedScope : "all";
  const sort: CaseQueueSort = isCaseQueueSort(params.sort) ? params.sort : "recent";
  const { canCreateCase } = buildNavigationCapabilities(user);
  const now = new Date();

  const cases = await listCases({
    search: q || undefined,
    status,
    riskLevel: risk,
    scope,
    trustedCurrentUserId: scope === "mine" ? user.id : undefined,
    sort,
    now,
  });

  const emptyMessage =
    scope === "mine"
      ? "当前没有由你负责的案件。"
      : scope === "unassigned"
        ? "当前没有未分配案件。"
        : canCreateCase
          ? "创建第一个研判案件后，可在这里继续处理。"
          : "当前账号为只读访问，暂无可见案件。";

  const filterBase = { scope, sort, q, status, risk };

  return (
    <PageFrame width="normal">
      <PageHeader
        title="案件队列"
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

      {canUseQueueScopes ? (
        <nav
          className="mb-3 flex gap-1 overflow-x-auto pb-1"
          aria-label="案件队列范围"
          data-testid="case-queue-scopes"
        >
          {(
            [
              ["all", "全部"],
              ["mine", "我的"],
              ["unassigned", "未分配"],
            ] as const
          ).map(([value, label]) => {
            const active = scope === value;
            return (
              <Link
                key={value}
                href={queueHref({ ...filterBase, scope: value })}
                data-testid={`case-queue-scope-${value}`}
                className={
                  active
                    ? "shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-brand)] bg-[var(--ui-brand-selected)] px-3 py-1.5 text-xs font-medium text-[var(--ui-brand-hover)]"
                    : "shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-secondary)]"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <nav
        className="mb-3 flex gap-1 overflow-x-auto pb-1"
        aria-label="案件队列排序"
        data-testid="case-queue-sorts"
      >
        {(
          [
            ["recent", "最近活动"],
            ["due", "截止优先"],
          ] as const
        ).map(([value, label]) => {
          const active = sort === value;
          return (
            <Link
              key={value}
              href={queueHref({ ...filterBase, sort: value })}
              data-testid={`case-queue-sort-${value}`}
              className={
                  active
                    ? "shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-brand)] bg-[var(--ui-brand-selected)] px-3 py-1.5 text-xs font-medium text-[var(--ui-brand-hover)]"
                    : "shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-secondary)]"
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <form
        method="get"
        className="flex flex-col gap-3 border-b border-[var(--ui-border)] pb-5 sm:flex-row sm:flex-wrap sm:items-end"
        data-testid="case-list-filters"
      >
        {scope !== "all" ? (
          <input type="hidden" name="scope" value={scope} />
        ) : null}
        {sort !== "recent" ? (
          <input type="hidden" name="sort" value={sort} />
        ) : null}
        <label className="min-w-0 flex-1 text-sm sm:min-w-[240px]">
          <span className="text-xs font-medium text-[var(--ui-text-secondary)]">搜索</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="案件编号 / 事件名称 / 账号 / IP / 系统"
            aria-label="搜索案件"
            className="mt-1 h-10 w-full rounded-[var(--ui-radius-input)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text-primary)] placeholder:text-[var(--ui-text-muted)]"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-medium text-[var(--ui-text-secondary)]">状态</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 block h-9 w-full rounded-[var(--ui-radius-input)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text-primary)] sm:w-auto"
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
          <span className="text-xs font-medium text-[var(--ui-text-secondary)]">风险</span>
          <select
            name="risk"
            defaultValue={risk ?? ""}
            className="mt-1 block h-9 w-full rounded-[var(--ui-radius-input)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text-primary)] sm:w-auto"
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
        <div className="ui-panel" data-testid="case-list-empty">
          <EmptyState
            title={scope === "all" ? "暂无案件" : "暂无匹配案件"}
            description={emptyMessage}
            action={
              canCreateCase && scope === "all" ? (
                <Link href="/cases/new" className={actionClass.primary}>
                  + 新建研判
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="ui-panel hidden overflow-hidden md:block" data-density="comfortable">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-border-subtle)] text-left text-xs font-medium text-[var(--ui-text-secondary)]">
                  <th className="px-4 py-3">案件</th>
                  <th className="px-4 py-3">风险</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">处理</th>
                  <th className="px-4 py-3">最近活动</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => {
                  const riskDisplay = resolveCaseListRiskDisplay(
                    item.humanRiskLevel,
                    item.suggestedRiskLevel,
                  );
                  const systems = displaySystems(item.systemsSearchText);
                  const ownerLabel = formatCaseAssigneeLabel(item.ownership.assignee, {
                    currentUserId: user.id,
                  });
                  const dueLabel = formatOperationalDueLabel({
                    dueAt: item.dueAt,
                    status: item.status,
                    now,
                  });
                  const pending =
                    item.pendingChecklistCount > 0
                      ? `${item.pendingChecklistCount} 待核查`
                      : null;
                  const secondary = [item.username, systems]
                    .filter((part) => part && part !== "—")
                    .join(" · ");
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--ui-border-subtle)] last:border-0 hover:bg-[var(--ui-surface-secondary)]"
                      data-testid="case-list-row"
                    >
                      <td className="max-w-[360px] px-4 py-3">
                        <Link
                          href={`/cases/${item.id}`}
                          className="block min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-brand)]"
                        >
                          <span className="font-mono text-xs text-[var(--ui-text-secondary)]">
                            {item.caseNumber}
                          </span>
                          <span className="mt-0.5 block text-[14px] font-medium leading-5 text-[var(--ui-text-primary)]">
                            {item.title}
                          </span>
                          <span
                            className="mt-0.5 block text-xs text-[var(--ui-text-secondary)]"
                            data-testid="case-list-owner"
                          >
                            负责人：{ownerLabel}
                          </span>
                          {secondary ? (
                            <span className="mt-0.5 block truncate text-xs text-[var(--ui-text-secondary)]">
                              {secondary}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`ui-badge ${riskBadgeClass(riskDisplay.riskLabel)}`}
                          data-testid="case-list-risk"
                          data-risk-source={riskDisplay.source}
                        >
                          {riskDisplay.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`ui-badge ${statusBadgeClass(item.status)}`}
                        >
                          {displayCaseStatus(item.status)}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-[var(--ui-text-secondary)]"
                        data-testid="case-list-handling"
                      >
                        <div className="tabular-nums text-xs">
                          {pending ?? "无待核查"}
                        </div>
                        <div
                          className="mt-0.5 text-xs text-[var(--ui-text-secondary)]"
                          data-testid="case-list-due"
                        >
                          {dueLabel}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--ui-text-secondary)]">
                        {displayUpdatedAt(item.lastActivityAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul
            className="ui-panel divide-y divide-[var(--ui-border-subtle)] overflow-hidden md:hidden"
            data-testid="case-list-mobile"
          >
            {cases.map((item) => {
              const riskDisplay = resolveCaseListRiskDisplay(
                item.humanRiskLevel,
                item.suggestedRiskLevel,
              );
              const systems = displaySystems(item.systemsSearchText);
              const ownerLabel = formatCaseAssigneeLabel(item.ownership.assignee, {
                currentUserId: user.id,
              });
              const dueLabel = formatOperationalDueLabel({
                dueAt: item.dueAt,
                status: item.status,
                now,
              });
              const secondary = [item.username, systems]
                .filter((part) => part && part !== "—")
                .join(" · ");
              const pendingText =
                item.pendingChecklistCount > 0
                  ? `${item.pendingChecklistCount} 待核查`
                  : "无待核查";
              return (
                <li key={item.id}>
                  <Link
                    href={`/cases/${item.id}`}
                    className="block px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ui-brand)]"
                    aria-label={`${item.caseNumber} ${item.title}`}
                  >
                    <div className="font-mono text-xs text-[var(--ui-text-secondary)]">
                      {item.caseNumber}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-[var(--ui-text-primary)]">
                      {item.title}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`ui-badge ${riskBadgeClass(riskDisplay.riskLabel)}`}
                        data-testid="case-list-risk"
                        data-risk-source={riskDisplay.source}
                      >
                        {riskDisplay.text}
                      </span>
                      <span
                        className={`ui-badge ${statusBadgeClass(item.status)}`}
                      >
                        {displayCaseStatus(item.status)}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 text-xs text-[var(--ui-text-secondary)]"
                      data-testid="case-list-owner"
                    >
                      负责人：{ownerLabel}
                    </div>
                    <div
                      className="mt-0.5 text-xs text-[var(--ui-text-secondary)]"
                      data-testid="case-list-handling"
                    >
                      {pendingText}
                      {" · "}
                      <span data-testid="case-list-due">{dueLabel}</span>
                    </div>
                    {secondary ? (
                      <div className="mt-0.5 truncate text-xs text-[var(--ui-text-secondary)]">
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
