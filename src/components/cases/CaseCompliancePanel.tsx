"use client";

import { useState, type ReactNode } from "react";
import { Panel } from "@/components/common";
import type {
  CaseCompliancePanelItem,
  CaseCompliancePanelView,
} from "@/services/knowledge/caseCompliancePanel";
import {
  CASE_COMPLIANCE_PANEL_DISCLAIMER,
  formatCaseComplianceRelevanceLabel,
} from "@/services/knowledge/caseCompliancePanel";

/**
 * SUCCESS = resolver 正常 resolve（含真实零 findings）；
 * RESOLUTION_UNAVAILABLE = resolver 失败，绝不能与「真实零 findings」展示相同文案。
 * 与 Server `ComplianceResolutionStatus` 对齐的只读形状（避免 Client import resolver）。
 */
export type ComplianceResolutionStatus = "SUCCESS" | "RESOLUTION_UNAVAILABLE";

export const CASE_COMPLIANCE_PANEL_UNAVAILABLE_MESSAGE =
  "合规参考暂不可用，请稍后重试。";
function versionBasisText(item: CaseCompliancePanelItem): string {
  if (item.versionSelectionBasis === "CASE_DATE" && item.caseDate) {
    return `案件日期 ${item.caseDate} 适用版本`;
  }
  return "当前日期适用版本";
}

function sourceTypeLabel(sourceType: CaseCompliancePanelItem["sourceType"]): string {
  if (!sourceType) return "（未标注）";
  switch (sourceType) {
    case "OFFICIAL_PUBLIC":
      return "官方公开";
    case "USER_PROVIDED":
      return "用户提供";
    case "LICENSED":
      return "授权许可";
    case "OTHER":
      return "其他";
    default:
      return sourceType;
  }
}

function TechnicalDetailsDisclosure({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded border border-dashed border-neutral-300 bg-neutral-50/80 px-2 py-1.5">
      <button
        type="button"
        className="text-[11px] text-neutral-500 underline underline-offset-2"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "收起技术详情" : "技术详情"}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-0.5 text-[11px] leading-5 text-neutral-500">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ComplianceCard({ item }: { item: CaseCompliancePanelItem }) {
  const [open, setOpen] = useState(false);
  const nav = item.officialSource;

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
            <span className="text-neutral-500">发布机关：</span>
            {item.issuingAuthority ?? "（未标注）"}
          </p>
          <p>
            <span className="text-neutral-500">来源权威性：</span>
            {sourceTypeLabel(item.sourceType)}
          </p>
          <p>
            <span className="text-neutral-500">版本：</span>
            {item.versionLabel}
          </p>
          <p>
            <span className="text-neutral-500">生效日期：</span>
            {item.effectiveDate ?? "（未标注）"}
          </p>
          <p>
            <span className="text-neutral-500">版本选择依据：</span>
            {versionBasisText(item)}
          </p>
          {item.missingContext.length > 0 && (
            <p>
              <span className="text-neutral-500">缺少上下文：</span>
              {item.missingContext.map((m) => m.label).join("、")}
            </p>
          )}

          <div className="rounded border border-neutral-200 bg-white px-2 py-1.5">
            <p className="font-medium text-neutral-800">官方来源</p>
            {nav.available && nav.href ? (
              <p className="mt-1">
                <a
                  href={nav.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  查看官方来源
                </a>
                <span className="ml-2 text-neutral-500">
                  {nav.targetKind === "CLAUSE_ANCHOR"
                    ? "（含条款定位）"
                    : "（官方文档页）"}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-neutral-500">暂无可用官方来源链接</p>
            )}
            {/* SUMMARY_ONLY / GB/T：明确不提供「查看原文条款」假入口 */}
            {item.isSummaryOnly && (
              <p className="mt-1 text-[11px] text-neutral-500">
                本条为标准要求摘要/控制参考，不提供原文条款跳转。
              </p>
            )}
          </div>

          <TechnicalDetailsDisclosure>
            <p>
              <span className="text-neutral-400">文档内部编码：</span>
              {item.documentCanonicalCode}
            </p>
            <p>
              <span className="text-neutral-400">版本键：</span>
              {item.versionKey}
            </p>
            <p>
              <span className="text-neutral-400">版本选择类型：</span>
              {item.versionSelectionBasis}
            </p>
            <p>
              <span className="text-neutral-400">关联规则：</span>
              {item.ruleIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-400">支撑规则：</span>
              {item.supportingRuleIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-400">关联证据：</span>
              {item.evidenceIds.join("、") || "（无）"}
            </p>
            <p>
              <span className="text-neutral-400">关系类型：</span>
              {item.relationTypes.join("、") || "（无）"}
            </p>
          </TechnicalDetailsDisclosure>
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
  resolutionStatus = "SUCCESS",
}: {
  view: CaseCompliancePanelView;
  /** 默认 SUCCESS：保持既有调用方/测试不受影响 */
  resolutionStatus?: ComplianceResolutionStatus;
}) {
  const unavailable = resolutionStatus === "RESOLUTION_UNAVAILABLE";
  return (
    <Panel
      title="合规参考"
      extra={
        !unavailable && !view.empty ? (
          <span className="text-xs text-neutral-500">{view.totalCount} 条</span>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs leading-5 text-neutral-600">
        {CASE_COMPLIANCE_PANEL_DISCLAIMER}
      </p>

      {unavailable ? (
        <p className="text-sm text-amber-700">
          {CASE_COMPLIANCE_PANEL_UNAVAILABLE_MESSAGE}
        </p>
      ) : view.empty ? (
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
