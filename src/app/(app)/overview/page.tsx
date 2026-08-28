import Link from "next/link";
import {
  displayCaseStatus,
  riskBadgeClass,
  resolveCaseListRiskDisplay,
  statusBadgeClass,
} from "@/components/cases/caseDisplay";
import { actionClass } from "@/components/layout/pageChrome";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { ForbiddenError } from "@/domain/auth";
import {
  formatOperationalDueCompact,
  resolveOperationalDueState,
} from "@/domain/caseDueDate";
import { buildNavigationCapabilities } from "@/domain/uiCapabilities";
import { requirePermission } from "@/services/auth/requirePermission";
import { listCases } from "@/services/persistence/caseRepository";

export const dynamic = "force-dynamic";

/** 轻量运营总览：复用案件队列数据与同一权限边界，不引入第二套统计模型。 */
export default async function OverviewPage() {
  let user;
  try {
    user = await requirePermission("CASE_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <ForbiddenPanel message="当前账号无权限查看运营总览。" />;
    }
    throw error;
  }

  const now = new Date();
  const cases = await listCases({ now });
  const activeCases = cases.filter((item) => item.status !== "CLOSED");
  const dueToday = activeCases.filter(
    (item) =>
      resolveOperationalDueState({ dueAt: item.dueAt, status: item.status, now }) ===
      "DUE_TODAY",
  );
  const overdue = activeCases.filter(
    (item) =>
      resolveOperationalDueState({ dueAt: item.dueAt, status: item.status, now }) ===
      "OVERDUE",
  );
  const focusCases = activeCases
    .filter((item) => {
      const dueState = resolveOperationalDueState({
        dueAt: item.dueAt,
        status: item.status,
        now,
      });
      return (
        item.pendingChecklistCount > 0 ||
        dueState === "OVERDUE" ||
        item.humanRiskLevel === "HIGH" ||
        item.humanRiskLevel === "CRITICAL" ||
        item.suggestedRiskLevel === "HIGH" ||
        item.suggestedRiskLevel === "CRITICAL"
      );
    })
    .slice(0, 5);
  const capabilities = buildNavigationCapabilities(user);

  return (
    <PageFrame width="normal">
      <PageHeader
        eyebrow="SECURITY CONSOLE"
        title="安全运营总览"
        description="快速了解当前风险、截止情况和下一步行动。"
      />

      <section
        aria-label="运营摘要"
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <Link
          href="/cases"
          className="group border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 transition hover:border-[var(--ui-brand)]"
        >
          <p className="text-sm text-[var(--ui-text-secondary)]">待处理案件</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ui-text-primary)]">
            {activeCases.length}
          </p>
          <p className="mt-1 text-xs text-[var(--ui-text-muted)]">当前未闭环案件</p>
        </Link>
        <Link
          href="/cases?sort=due"
          className="group border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 transition hover:border-[var(--ui-brand)]"
        >
          <p className="text-sm text-[var(--ui-text-secondary)]">今日到期</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ui-text-primary)]">
            {dueToday.length}
          </p>
          <p className="mt-1 text-xs text-[var(--ui-text-muted)]">按 UTC+8 日历日计算</p>
        </Link>
        <Link
          href="/cases?sort=due"
          className="group border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 transition hover:border-[var(--ui-brand)]"
        >
          <p className="text-sm text-[var(--ui-text-secondary)]">已逾期</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ui-text-primary)]">
            {overdue.length}
          </p>
          <p className="mt-1 text-xs text-[var(--ui-text-muted)]">需要优先处理</p>
        </Link>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section
          className="border border-[var(--ui-border)] bg-[var(--ui-surface)]"
          aria-labelledby="overview-focus-heading"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--ui-border-subtle)] px-5 py-4">
            <div>
              <h2
                id="overview-focus-heading"
                className="text-base font-semibold text-[var(--ui-text-primary)]"
              >
                需要关注的案件
              </h2>
              <p className="mt-1 text-sm text-[var(--ui-text-secondary)]">
                优先显示有待核查、逾期或较高风险信号的案件。
              </p>
            </div>
            <Link
              href="/cases"
              className="shrink-0 text-sm text-[var(--ui-brand)] hover:underline"
            >
              查看全部
            </Link>
          </div>
          {focusCases.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-[var(--ui-text-primary)]">
                当前没有需要优先关注的案件
              </p>
              <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">
                新告警进入后，会在这里显示下一步行动。
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--ui-border-subtle)]">
              {focusCases.map((item) => {
                const risk = resolveCaseListRiskDisplay(
                  item.humanRiskLevel,
                  item.suggestedRiskLevel,
                );
                return (
                  <Link
                    key={item.id}
                    href={`/cases/${item.id}`}
                    className="block px-5 py-4 transition hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-brand)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-[var(--ui-text-muted)]">
                          {item.caseNumber}
                        </p>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--ui-text-primary)]">
                          {item.title}
                        </p>
                        <p className="mt-2 text-xs text-[var(--ui-text-secondary)]">
                          {item.pendingChecklistCount > 0
                            ? `${item.pendingChecklistCount} 项待核查`
                            : "暂无待核查项"}
                          <span className="mx-2 text-[var(--ui-text-muted)]">·</span>
                          {formatOperationalDueCompact({
                            dueAt: item.dueAt,
                            status: item.status,
                            now,
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-[var(--ui-radius-control)] border px-2 py-1 text-xs ${riskBadgeClass(risk.riskLabel)}`}
                        >
                          {risk.text}
                        </span>
                        <span
                          className={`rounded-[var(--ui-radius-control)] border px-2 py-1 text-xs ${statusBadgeClass(item.status)}`}
                        >
                          {displayCaseStatus(item.status)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section
          className="border border-[var(--ui-border)] bg-[var(--ui-surface)]"
          aria-labelledby="overview-actions-heading"
        >
          <div className="border-b border-[var(--ui-border-subtle)] px-5 py-4">
            <h2
              id="overview-actions-heading"
              className="text-base font-semibold text-[var(--ui-text-primary)]"
            >
              快速操作
            </h2>
            <p className="mt-1 text-sm text-[var(--ui-text-secondary)]">
              从当前任务继续工作。
            </p>
          </div>
          <div className="flex flex-col gap-2 p-5">
            {capabilities.canCreateCase ? (
              <Link href="/cases/new" className={actionClass.primary}>
                新建研判案件
              </Link>
            ) : null}
            <Link href="/cases" className={actionClass.secondary}>
              查看案件队列
            </Link>
            <Link href="/raw-alerts" className={actionClass.secondary}>
              查看原始告警
            </Link>
            <Link href="/reports" className={actionClass.secondary}>
              打开报告中心
            </Link>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

