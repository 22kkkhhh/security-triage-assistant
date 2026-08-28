"use client";

import { useMemo, useRef, useState } from "react";
import { importJsonlAction, type BatchImportResult } from "@/app/(app)/cases/importActions";
import { actionErrorMessage } from "@/lib/actionErrorMessage";
import { importSourceTypeLabels, type ImportSourceType } from "@/services/normalization/types";
import { parseJsonlLines } from "@/services/intake/parseJsonl";

const sourceOptions = Object.entries(importSourceTypeLabels) as [ImportSourceType, string][];

export function BatchJsonlImport() {
  const [sourceType, setSourceType] = useState<ImportSourceType>("WAZUH");
  const [text, setText] = useState("");
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const parsed = parseJsonlLines(text);
      return { valid: parsed.entries.length, invalid: parsed.failures.length, lines: parsed.totalLines };
    } catch (previewError) {
      return { valid: 0, invalid: 0, lines: 0, error: previewError instanceof Error ? previewError.message : "内容超过限制" };
    }
  }, [text]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await importJsonlAction(text, sourceType, crypto.randomUUID());
      if (!response.ok) setError(actionErrorMessage(response, "批量导入失败，请重试。"));
      else setResult(response);
    } catch {
      setError("批量导入失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">JSONL 批量导入</h2>
          <p className="mt-1 text-sm text-slate-500">每行一个 JSON 告警。服务器会先脱敏保存原始记录，再按现有去重规则创建案件。</p>
        </div>
        <label className="text-sm text-slate-600">
          数据来源
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as ImportSourceType)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
            {sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm font-medium text-slate-700" htmlFor="jsonl-file">选择 .jsonl / .ndjson 文件</label>
          <input ref={fileRef} id="jsonl-file" type="file" accept=".jsonl,.ndjson,.json,application/json" onChange={(event) => void handleFile(event.target.files?.[0])} className="max-w-full text-sm text-slate-600" />
        </div>
        <textarea value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} placeholder={'{"id":"alert-001","timestamp":"2026-08-28T01:00:00Z","rule":{"description":"示例告警","level":8}}'} rows={10} className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>最多 100 条、总计 1 MB；预览只显示条数，不回显原始内容。</span>
          {preview && (preview.error ? <span className="text-red-700">{preview.error}</span> : <span>{preview.valid} 条可解析 · {preview.invalid} 条格式错误</span>)}
        </div>
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => { setText(""); setResult(null); setError(null); if (fileRef.current) fileRef.current.value = ""; }} disabled={submitting || !text} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">清空</button>
        <button type="button" onClick={() => void submit()} disabled={submitting || !text.trim()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "正在导入…" : "开始导入"}</button>
      </div>

      {result?.ok && (
        <div className="space-y-4 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Summary label="已创建" value={result.created} tone="green" />
            <Summary label="重复告警" value={result.duplicate} tone="amber" />
            <Summary label="已拒绝" value={result.rejected} tone="red" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">行</th><th className="px-3 py-2">结果</th><th className="px-3 py-2">案件</th><th className="px-3 py-2">说明</th></tr></thead><tbody className="divide-y divide-slate-100">{result.items.map((item) => <tr key={`${item.line}-${item.status}`}><td className="px-3 py-2 text-slate-500">{item.line}</td><td className="px-3 py-2 font-medium">{item.status === "CREATED" ? "已创建" : item.status === "DUPLICATE" ? "重复" : "已拒绝"}</td><td className="px-3 py-2">{item.caseNumber ?? "—"}</td><td className="px-3 py-2 text-slate-500">{item.error ?? "—"}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" }) {
  const styles = { green: "border-emerald-200 bg-emerald-50 text-emerald-800", amber: "border-amber-200 bg-amber-50 text-amber-800", red: "border-red-200 bg-red-50 text-red-800" }[tone];
  return <div className={`rounded-lg border px-4 py-3 ${styles}`}><div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
