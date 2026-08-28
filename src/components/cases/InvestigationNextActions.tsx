"use client";

import type { ChecklistItem, SecurityCaseDraft } from "@/domain/types";
import type { InvestigationIntelligenceView } from "@/services/correlation/investigationIntelligenceTypes";
import { INVESTIGATION_SECTION_IDS, scrollToInvestigationSection } from "./investigationProgressSummary";
import { EntityInvestigationPanel, type EntityRef } from "./EntityInvestigationPanel";

export function InvestigationNextActions({
  draft,
  checklist,
  pendingContext,
  intelligence = { relatedCases: [], relatedCaseCount: 0, signals: [], leads: [] },
  entityRequest,
}: {
  draft: SecurityCaseDraft;
  checklist: ChecklistItem[];
  pendingContext: number;
  intelligence?: InvestigationIntelligenceView;
  entityRequest?: EntityRef | null;
}) {
  const pending = checklist.filter((item) => !item.completed).slice(0, pendingContext > 0 ? 2 : 3);
  return (
    <section id="investigation-next-actions" data-testid="investigation-next-actions" className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-700">下一步行动</p><h2 className="mt-1 text-base font-semibold text-slate-900">先处理最影响结论的事实</h2><p className="mt-1 text-sm text-slate-600">从当前案件继续调查，不需要复制账号、IP 或系统名称。</p></div>
        <button type="button" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.investigation)}>开始调查</button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {pending.length > 0 ? pending.map((item) => (
          <button key={item.id} type="button" className="rounded-md border border-blue-200 bg-white p-3 text-left hover:border-blue-400 hover:shadow-sm" onClick={() => scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.checklist)}>
            <span className="text-sm font-medium text-slate-900">{item.label}</span>
            <span className="mt-1 block text-xs text-slate-500">核查目标 · {item.sourceRef?.targetRef?.kind ?? item.relatedRuleId ?? "案件事实"}</span>
            <span className="mt-2 block text-xs font-medium text-blue-700">打开核查项 →</span>
          </button>
        )) : <p className="text-sm text-slate-600">当前没有待处理核查项。</p>}
        {pendingContext > 0 ? <button type="button" className="rounded-md border border-amber-200 bg-white p-3 text-left hover:border-amber-400 hover:shadow-sm" onClick={() => scrollToInvestigationSection(INVESTIGATION_SECTION_IDS.businessContext)}><span className="text-sm font-medium text-slate-900">补充业务上下文</span><span className="mt-1 block text-xs text-slate-500">{pendingContext} 项信息待确认</span><span className="mt-2 block text-xs font-medium text-blue-700">查看业务确认 →</span></button> : null}
      </div>
      <div className="mt-4 border-t border-blue-100 pt-3"><p className="mb-2 text-xs font-medium text-slate-600">调查对象（点击查看当前与历史）</p><EntityInvestigationPanel draft={draft} intelligence={intelligence} requestedEntity={entityRequest} onNavigate={(target) => scrollToInvestigationSection(target === "timeline" ? INVESTIGATION_SECTION_IDS.records : INVESTIGATION_SECTION_IDS.evidence)} /></div>
    </section>
  );
}
