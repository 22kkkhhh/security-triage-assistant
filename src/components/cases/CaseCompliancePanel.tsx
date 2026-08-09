"use client";

import { useState } from "react";
import { Panel } from "@/components/common";
import type {
  CaseCompliancePanelItem,
  CaseCompliancePanelView,
} from "@/services/knowledge/caseCompliancePanel";
import {
  CASE_COMPLIANCE_PANEL_DISCLAIMER,
  formatCaseComplianceRelevanceLabel,
} from "@/services/knowledge/caseCompliancePanel";

function versionBasisText(item: CaseCompliancePanelItem): string {
  if (item.versionSelectionBasis === "CASE_DATE" && item.caseDate) {
    return `案件日期 ${item.caseDate} 适用版本`;
  }
  return "当前日期适用版本";
}

function ComplianceCard({ item }: { item: CaseCompliancePanelItem }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded border border-neutral-200 bg-neutral-50/40 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-neutral-900">
            《{item.documentTitle}》
          </h4>
          <p className="mt-0.5 text-sm text-neutral-800">{item.clauseLabel}</p>
          <p className="mt-1 text-xs text-neutral-600">
            关联程度：{formatCaseComplianceRelevanceLabel(item.relevance)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            关联控制：{item.controlCodes.join("、") || "（无）"}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-700">{item.summary}</p>
          {item.isSummaryOnly && (
            <p className="mt-1 inline-block rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700">
              标准要求摘要/控制参考
            </p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-slate-700 underline underline-offset-2"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "收起详情" : "展开详情"}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 text-xs leading-5 text-neutral-700">
          <p>
            <span className="text-neutral-500">文档编码：</span>
            {item.documentCanonicalCode}
          </p>
          <p>
            <span className="text-neutral-500">版本：</span>
            {item.versionLabel}（{item.versionKey}）
          </p>
          <p>
            <span className="text-neutral-500">版本选择依据：</span>
            {versionBasisText(item)}（{item.versionSelectionBasis}）
          </p>
          {item.missingContext.length > 0 && (
            <p>
              <span className="text-neutral-500">缺少上下文：</span>
              {item.missingContext.map((m) => m.label).join("、")}
            </p>
          )}
          {item.sourceUrl && (
            <p>
              <span className="text-neutral-500">来源：</span>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {item.sourceUrl}
              </a>
            </p>
          )}
          <div className="rounded border border-dashed border-neutral-300 bg-white px-2 py-1.5">
            <p className="font-medium text-neutral-800">审计信息</p>
            <p className="mt-0.5">
              <span className="text-neutral-500">规则：</span>
              {item.ruleIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-500">supportingRuleIds：</span>
              {item.supportingRuleIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-500">evidenceIds：</span>
              {item.evidenceIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-500">关系类型：</span>
              {item.relationTypes.join("、")}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Case 详情页只读合规参考面板。
 * 仅展示服务端已构建的 CaseCompliancePanelView，不查询 Knowledge DB。
 */
export function CaseCompliancePanel({
  view,
}: {
  view: CaseCompliancePanelView;
}) {
  return (
    <Panel
      title="合规参考"
      extra={
        !view.empty ? (
          <span className="text-xs text-neutral-500">{view.totalCount} 条</span>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs leading-5 text-neutral-600">
        {CASE_COMPLIANCE_PANEL_DISCLAIMER}
      </p>

      {view.empty ? (
        <p className="text-sm text-neutral-500">当前未发现可展示的合规参考</p>
      ) : (
        <div className="space-y-4">
          {view.groups.map((group) => (
            <section key={group.relevance} aria-label={group.title}>
              <h3 className="mb-2 text-xs font-semibold text-neutral-800">
                {group.title}
                <span className="ml-1 font-normal text-neutral-500">
                  （{group.items.length}）
                </span>
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <ComplianceCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
