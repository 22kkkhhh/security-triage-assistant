"use client";

import { useMemo, useState } from "react";
import type { SecurityCaseDraft } from "@/domain/types";
import type { InvestigationIntelligenceView } from "@/services/correlation/investigationIntelligenceTypes";
import { formatDateTimeForDisplay } from "@/lib/formatDateTimeForDisplay";

export type EntityKind = "账号" | "IP" | "系统";
export type EntityRef = { kind: EntityKind; value: string };

type EntityHistory = EntityRef & {
  firstSeen: string | null;
  lastSeen: string | null;
  occurrenceCount: number;
  relatedCases: Array<{ id: string; number: string; title: string }>;
  relatedEntities: EntityRef[];
  facts: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildEntityHistory(
  draft: SecurityCaseDraft,
  intelligence: InvestigationIntelligenceView,
): EntityHistory[] {
  const current: EntityRef[] = [];
  if (draft.identityContext.accountName) current.push({ kind: "账号", value: draft.identityContext.accountName });
  unique([draft.identityContext.loginSourceIp, draft.networkContext.internalSourceIp].filter((v): v is string => Boolean(v))).forEach((value) => current.push({ kind: "IP", value }));
  unique([...draft.identityContext.accessedSystems, draft.dataContext.databaseName].filter((v): v is string => Boolean(v))).forEach((value) => current.push({ kind: "系统", value }));

  return current.map((entity) => {
    const matches = intelligence.relatedCases.filter((item) => item.reasons.some((reason) => reason.value === entity.value));
    const relatedEntities: EntityRef[] = [];
    if (entity.kind !== "账号" && draft.identityContext.accountName) relatedEntities.push({ kind: "账号", value: draft.identityContext.accountName });
    if (entity.kind !== "IP" && draft.identityContext.loginSourceIp) relatedEntities.push({ kind: "IP", value: draft.identityContext.loginSourceIp });
    if (entity.kind !== "系统" && draft.dataContext.databaseName) relatedEntities.push({ kind: "系统", value: draft.dataContext.databaseName });
    const dates = [draft.alert.occurredAt, draft.createdAt, ...matches.map((item) => item.lastActivityAt)].filter((value): value is string => Boolean(value)).sort();
    return {
      ...entity,
      firstSeen: dates[0] ?? null,
      lastSeen: dates.at(-1) ?? null,
      occurrenceCount: 1 + matches.length,
      relatedCases: matches.map((item) => ({ id: item.caseId, number: item.caseNumber, title: item.title })),
      relatedEntities: unique(relatedEntities.map((item) => `${item.kind}:${item.value}`)).map((key) => {
        const [kind, ...rest] = key.split(":");
        return { kind: kind as EntityKind, value: rest.join(":") };
      }),
      facts: matches.length > 0
        ? matches.flatMap((item) => item.reasons.filter((reason) => reason.value === entity.value).map((reason) => `${reason.code} · ${reason.value}`))
        : ["历史数据不足，当前仅展示本案已标准化事实。"],
    };
  });
}

export function EntityInvestigationPanel({
  draft,
  intelligence,
  onNavigate,
  requestedEntity,
}: {
  draft: SecurityCaseDraft;
  intelligence: InvestigationIntelligenceView;
  onNavigate?: (target: "timeline" | "evidence") => void;
  requestedEntity?: EntityRef | null;
}) {
  const [selected, setSelected] = useState<EntityHistory | null>(null);
  const [dismissedRequestKey, setDismissedRequestKey] = useState<string | null>(null);
  const histories = useMemo(() => buildEntityHistory(draft, intelligence), [draft, intelligence]);
  const requestedKey = requestedEntity
    ? requestedEntity.kind + ":" + requestedEntity.value
    : null;
  const requestedMatch = requestedEntity
    ? histories.find((item) => item.kind === requestedEntity.kind && item.value === requestedEntity.value) ?? null
    : null;
  const visibleSelection =
    requestedMatch && dismissedRequestKey !== requestedKey ? requestedMatch : selected;
  const selectEntity = (entity: EntityHistory) => {
    setSelected(entity);
    setDismissedRequestKey(requestedKey);
  };
  const closePanel = () => {
    setSelected(null);
    setDismissedRequestKey(requestedKey);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2" data-testid="entity-reference-list">
        {histories.map((entity) => (
          <button key={`${entity.kind}:${entity.value}`} type="button" className="rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-sm text-blue-800 hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => selectEntity(entity)}>
            {entity.kind} · <span className="font-mono">{entity.value}</span>
          </button>
        ))}
      </div>
      {visibleSelection ? (
        <div className="fixed inset-0 z-40" role="presentation">
          <button className="absolute inset-0 bg-slate-900/20" aria-label="关闭实体面板" onClick={closePanel} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl" aria-label={`${visibleSelection.kind}调查`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-medium text-blue-700">{visibleSelection.kind}调查</p><h2 className="mt-1 break-all text-lg font-semibold text-slate-900">{visibleSelection.value}</h2></div>
              <button type="button" className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={closePanel} aria-label="关闭实体面板">关闭</button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded border border-slate-200 bg-slate-50 p-2"><span className="block text-slate-500">出现次数</span><strong className="text-base text-slate-900">{visibleSelection.occurrenceCount}</strong></div>
              <div className="rounded border border-slate-200 bg-slate-50 p-2"><span className="block text-slate-500">首次出现</span><strong className="block truncate text-slate-900">{formatDateTimeForDisplay(visibleSelection.firstSeen)}</strong></div>
              <div className="rounded border border-slate-200 bg-slate-50 p-2"><span className="block text-slate-500">最近出现</span><strong className="block truncate text-slate-900">{formatDateTimeForDisplay(visibleSelection.lastSeen)}</strong></div>
            </div>
            <section className="mt-5"><h3 className="text-sm font-semibold text-slate-900">历史事实</h3><ul className="mt-2 space-y-1 text-sm text-slate-600">{visibleSelection.facts.map((fact) => <li key={fact}>· {fact}</li>)}</ul></section>
            {visibleSelection.relatedEntities.length > 0 && <section className="mt-5"><h3 className="text-sm font-semibold text-slate-900">关联对象</h3><div className="mt-2 flex flex-wrap gap-2">{visibleSelection.relatedEntities.map((item) => <span key={`${item.kind}:${item.value}`} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.kind} · {item.value}</span>)}</div></section>}
            {visibleSelection.relatedCases.length > 0 && <section className="mt-5"><h3 className="text-sm font-semibold text-slate-900">关联案件</h3><ul className="mt-2 space-y-2">{visibleSelection.relatedCases.map((item) => <li key={item.id} className="rounded border border-slate-200 p-2"><p className="font-mono text-xs text-slate-500">{item.number}</p><p className="text-sm text-slate-800">{item.title}</p></li>)}</ul></section>}
            <div className="mt-6 grid gap-2"><button type="button" className="rounded-md border border-blue-200 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50" onClick={() => { closePanel(); onNavigate?.("timeline"); }}>查看时间线中的相关活动 →</button><button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { closePanel(); onNavigate?.("evidence"); }}>查看关联证据 →</button></div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

