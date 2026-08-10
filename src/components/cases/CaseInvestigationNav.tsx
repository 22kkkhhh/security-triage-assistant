"use client";

import {
  INVESTIGATION_SECTION_IDS,
  scrollToInvestigationSection,
} from "./investigationProgressSummary";

const NAV_LINKS: ReadonlyArray<{ label: string; targetId: string }> = [
  { label: "概览", targetId: INVESTIGATION_SECTION_IDS.progress },
  { label: "业务上下文", targetId: INVESTIGATION_SECTION_IDS.businessContext },
  {
    label: "证据与核查",
    targetId: INVESTIGATION_SECTION_IDS.evidenceWorkspace,
  },
  { label: "人工研判", targetId: INVESTIGATION_SECTION_IDS.humanReview },
  { label: "分析与合规", targetId: INVESTIGATION_SECTION_IDS.analysis },
  { label: "活动记录", targetId: INVESTIGATION_SECTION_IDS.records },
];

/**
 * 案件调查二级导航：anchor / scroll，不 mount/unmount 内容，避免丢失编辑态。
 */
export function CaseInvestigationNav() {
  return (
    <nav
      aria-label="调查导航"
      data-testid="case-investigation-nav"
      className="sticky top-0 z-20 -mx-1 border-b border-neutral-200 bg-white/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/90"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
        {NAV_LINKS.map((link) => (
          <button
            key={link.targetId}
            type="button"
            className="shrink-0 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            onClick={() => scrollToInvestigationSection(link.targetId)}
          >
            {link.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
