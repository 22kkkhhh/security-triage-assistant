import Link from "next/link";
import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/auth/ForbiddenPanel";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageHeader } from "@/components/layout/PageHeader";
import { ForbiddenError } from "@/domain/auth";
import { requirePermission } from "@/services/auth/requirePermission";
import { getRawAlertRecordDetail } from "@/services/persistence/rawAlertRepository";

type RawAlertDetailPageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ fromCase?: string }> };

const statusLabel: Record<string, string> = { RECEIVED: "已接收", CREATED: "已建案", DUPLICATE: "重复告警", REJECTED: "已拒绝" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", hour12: false }).format(value);
}

export default async function RawAlertDetailPage({ params, searchParams }: RawAlertDetailPageProps) {
  try {
    await requirePermission("CASE_READ");
  } catch (error) {
    if (error instanceof ForbiddenError) return <ForbiddenPanel title="无权查看原始告警" message="当前账号无权读取案件数据。" />;
    throw error;
  }

  const { id } = await params;
  const fromCase = (await searchParams)?.fromCase?.trim();
  const row = await getRawAlertRecordDetail(id);
  if (!row) notFound();

  const payload = typeof row.payloadJson === "string" ? row.payloadJson : JSON.stringify(row.payloadJson, null, 2);
  return (
    <PageFrame width="normal">
      <PageHeader
        back={<Link href={fromCase ? `/cases/${encodeURIComponent(fromCase)}` : "/raw-alerts"} className="text-sm text-[var(--ui-accent)] hover:underline">← {fromCase ? "返回案件" : "返回原始告警"}</Link>}
        eyebrow={<span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--ui-accent)]">告警接入</span>}
        title="原始告警详情"
        description="仅展示接入时保存的脱敏副本；原始敏感字段不会恢复，也不会提供下载。"
      />

      <section className="ui-panel space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ui-border-subtle)] pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">外部告警 ID</p>
            <p className="mt-1 break-all font-mono text-sm text-[var(--ui-text-primary)]">{row.externalAlertId ?? "未提供"}</p>
          </div>
          <span className="ui-badge ui-badge-neutral">{statusLabel[row.ingestStatus] ?? row.ingestStatus}</span>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-[var(--ui-text-muted)]">来源</dt><dd className="mt-1 text-sm font-medium text-[var(--ui-text-primary)]">{row.sourceType}</dd></div>
          <div><dt className="text-xs text-[var(--ui-text-muted)]">接收时间</dt><dd className="mt-1 text-sm text-[var(--ui-text-secondary)]">{formatDate(row.receivedAt)}</dd></div>
          <div><dt className="text-xs text-[var(--ui-text-muted)]">关联案件</dt><dd className="mt-1 text-sm">{row.caseId ? <Link href={`/cases/${row.caseId}`} className="font-mono text-[var(--ui-accent)] hover:underline">{row.caseId}</Link> : <span className="text-[var(--ui-text-secondary)]">未关联</span>}</dd></div>
          <div><dt className="text-xs text-[var(--ui-text-muted)]">脱敏版本</dt><dd className="mt-1 text-sm text-[var(--ui-success)]">v{row.redactionVersion.replace(/^v/, "")}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-[var(--ui-text-muted)]">载荷 SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-[var(--ui-text-secondary)]">{row.payloadHash}</dd></div>
        </dl>

        {row.errorMessage ? <div className="rounded-[var(--ui-radius-input)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span className="font-medium">处理备注：</span>{row.errorMessage}</div> : null}

        <details className="group rounded-[var(--ui-radius-input)] border border-[var(--ui-border)] bg-[var(--ui-surface-secondary)]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--ui-text-primary)] marker:hidden">查看脱敏告警内容 <span className="ml-1 text-xs text-[var(--ui-text-muted)] group-open:hidden">（默认折叠）</span><span className="ml-1 hidden text-xs text-[var(--ui-text-muted)] group-open:inline">（收起）</span></summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-[var(--ui-border)] px-4 py-4 text-xs leading-5 text-[var(--ui-text-secondary)]">{payload}</pre>
        </details>
      </section>
    </PageFrame>
  );
}
