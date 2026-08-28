"use client";

import { useCallback, useEffect, useState } from "react";

type RawAlertRow = { id: string; sourceType: string; externalAlertId: string | null; receivedAt: string; ingestStatus: string; caseId: string | null; errorMessage: string | null; payloadHash: string; redactionVersion: string };
type QueryResult = { page: number; pageSize: number; total: number; rows: RawAlertRow[] };

const statusLabel: Record<string, string> = { RECEIVED: "已接收", CREATED: "已建案", DUPLICATE: "重复告警", REJECTED: "已拒绝" };

export function RawAlertList() {
  const [sourceType, setSourceType] = useState("");
  const [status, setStatus] = useState("");
  const [externalAlertId, setExternalAlertId] = useState("");
  const [data, setData] = useState<QueryResult | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "25" });
    if (sourceType) params.set("sourceType", sourceType);
    if (status) params.set("status", status);
    if (externalAlertId.trim()) params.set("externalAlertId", externalAlertId.trim());
    try {
      const response = await fetch(`/api/raw-alerts?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as QueryResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "查询失败");
      setData(body); setPage(nextPage);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "原始告警查询暂不可用"); }
    finally { setLoading(false); }
  }, [externalAlertId, sourceType, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(1); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-slate-600">来源<select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">全部来源</option><option value="WAZUH">Wazuh</option><option value="FIREWALL">防火墙</option><option value="AUTH">认证系统</option><option value="OTHER">其他</option></select></label>
      <label className="text-sm text-slate-600">处理状态<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">全部状态</option><option value="CREATED">已建案</option><option value="DUPLICATE">重复告警</option><option value="REJECTED">已拒绝</option><option value="RECEIVED">已接收</option></select></label>
      <label className="min-w-64 flex-1 text-sm text-slate-600">外部告警 ID<input value={externalAlertId} onChange={(event) => setExternalAlertId(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(1); }} placeholder="按 externalAlertId 查询" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
      <button type="button" onClick={() => void load(1)} disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? "查询中…" : "筛选"}</button>
    </div>
    <p className="text-xs text-slate-500">仅展示接收元数据和脱敏状态；原始告警内容不会在列表中回显。</p>
    {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
    {loading && !data ? <div className="py-10 text-center text-sm text-slate-500">正在加载原始告警…</div> : null}
    {!loading && data && data.rows.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">暂无符合条件的原始告警</div> : null}
    {data && data.rows.length > 0 ? <>
      <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">接收时间</th><th className="px-3 py-2">来源</th><th className="px-3 py-2">外部告警 ID</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">关联案件</th><th className="px-3 py-2">脱敏</th></tr></thead><tbody className="divide-y divide-slate-100">{data.rows.map((row) => <tr key={row.id}><td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(row.receivedAt).toLocaleString("zh-CN", { hour12: false })}</td><td className="px-3 py-2">{row.sourceType}</td><td className="max-w-56 truncate px-3 py-2 font-mono text-xs" title={row.externalAlertId ?? "—"}>{row.externalAlertId ?? "—"}</td><td className="px-3 py-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{statusLabel[row.ingestStatus] ?? row.ingestStatus}</span></td><td className="px-3 py-2 font-mono text-xs">{row.caseId ? row.caseId.slice(0, 10) : "—"}</td><td className="px-3 py-2 text-emerald-700">v{row.redactionVersion.replace(/^v/, "")}</td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-between text-sm text-slate-500"><span>共 {data.total} 条 · 第 {page}/{totalPages} 页</span><div className="flex gap-2"><button type="button" onClick={() => void load(page - 1)} disabled={loading || page <= 1} className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40">上一页</button><button type="button" onClick={() => void load(page + 1)} disabled={loading || page >= totalPages} className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40">下一页</button></div></div>
    </> : null}
  </section>;
}
