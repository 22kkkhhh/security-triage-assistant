"use client";

import { useMemo, useState } from "react";
import type { ChecklistItem, SecurityCaseDraft } from "@/domain/types";
import { INVESTIGATION_SECTION_IDS, scrollToInvestigationSection } from "./investigationProgressSummary";

type Entity = { kind: "账号" | "IP" | "系统"; value: string; detail: string };

export function InvestigationNextActions({
  draft,
  checklist,
  pendingContext,
}: {
  draft: SecurityCaseDraft;
  checklist: ChecklistItem[];
  pendingContext: number;
}) {
  const [selected, setSelected] = useState<Entity | null>(null);
  const entities = useMemo<Entity[]>(() => {
    const result: Entity[] = [];
    if (draft.identityContext.accountName) {
      result.push({ kind: "账号", value: draft.identityContext.accountName, detail: "登录与身份行为历史" });
    }
    const ips = [draft.identityContext.loginSourceIp, draft.networkContext.internalSourceIp].filter(
      (v): v is string => Boolean(v),
    );
    for (const ip of Array.from(new Set(ips))) {
      result.push({ kind: "IP", value: ip, detail: "认证来源与网络活动" });
    }
    const systems = Array.from(
      new Set([
        ...draft.identityContext.accessedSystems,
        draft.dataContext.databaseName,
      ].filter((v): v is string => Boolean(v))),
    );
    for (const system of systems) {
      result.push({ kind: "系统", value: system, detail: "相关访问与证据" });
    }
    return result;
  }, [draft]);

  const pending = checklist.filter((item) => !item.completed).slice(0, 3);

  return (
    <>
      <section
        id="investigation-next-actions"
        data-testid="investigation-next-actions"
        className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-700">下一步行动</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">先处理最影响结论的事实</h2>
            <p className="mt-1 text-sm text-slate-600">从当前案件继续调查，不需要复制账号、IP 或系统名称。</p>
          </div>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.investigation)}
          >
            开始调查
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {pending.length > 0 ? pending.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-md border border-blue-200 bg-white p-3 text-left hover:border-blue-400 hover:shadow-sm"
              onClick={() => scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.checklist)}
            >
              <span className="text-sm font-medium text-slate-900">{item.label}</span>
              <span className="mt-1 block text-xs text-slate-500">核查目标 · {item.relatedRuleId ?? "案件事实"}</span>
              <span className="mt-2 block text-xs font-medium text-blue-700">打开核查项 →</span>
            </button>
          )) : (
            <p className="text-sm text-slate-600">当前没有待处理核查项。</p>
          )}
          {pendingContext > 0 ? (
            <button
              type="button"
              className="rounded-md border border-amber-200 bg-white p-3 text-left hover:border-amber-400 hover:shadow-sm"
              onClick={() => scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.businessContext)}
            >
              <span className="text-sm font-medium text-slate-900">补充业务上下文</span>
              <span className="mt-1 block text-xs text-slate-500">{pendingContext} 项信息待确认</span>
              <span className="mt-2 block text-xs font-medium text-blue-700">查看业务确认 →</span>
            </button>
          ) : null}
        </div>
        {entities.length > 0 ? (
          <div className="mt-4 border-t border-blue-100 pt-3">
            <p className="text-xs font-medium text-slate-600">调查对象</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {entities.map((entity) => (
                <button
                  key={entity.kind + entity.value}
                  type="button"
                  className="rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-sm text-blue-800 hover:border-blue-400"
                  onClick={() => setSelected(entity)}
                >
                  {entity.kind} · {entity.value}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {selected ? (
        <div className="fixed inset-0 z-40" role="presentation">
          <button className="absolute inset-0 bg-slate-900/20" aria-label="关闭实体面板" onClick={() => setSelected(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl" aria-label={selected.kind + "调查"}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-blue-700">{selected.kind}调查</p>
                <h2 className="mt-1 break-all text-lg font-semibold text-slate-900">{selected.value}</h2>
                <p className="mt-1 text-sm text-slate-600">{selected.detail}</p>
              </div>
              <button type="button" className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={() => setSelected(null)} aria-label="关闭实体面板">关闭</button>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">当前案件事实</p>
                <p className="mt-1 text-sm text-slate-600">该实体来自当前案件已标准化事实；历史数据不足时显示“未知”，不推断为正常。</p>
              </div>
              <button
                type="button"
                className="w-full rounded-md border border-blue-200 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50"
                onClick={() => { setSelected(null); scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.records); }}
              >
                查看时间线中的相关活动 →
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => { setSelected(null); scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.evidence); }}
              >
                查看关联证据 →
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

