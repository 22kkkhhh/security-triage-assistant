"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  INVESTIGATION_SECTION_IDS,
  scrollToInvestigationSection,
} from "./investigationProgressSummary";

export type WorkspaceView = "overview" | "investigation" | "analysis" | "records";

const NAV_LINKS: ReadonlyArray<{
  label: string;
  view: WorkspaceView;
  targetId: string;
}> = [
  { label: "概览", view: "overview", targetId: INVESTIGATION_SECTION_IDS.progress },
  { label: "调查", view: "investigation", targetId: INVESTIGATION_SECTION_IDS.investigation },
  { label: "分析", view: "analysis", targetId: INVESTIGATION_SECTION_IDS.analysis },
  { label: "记录", view: "records", targetId: INVESTIGATION_SECTION_IDS.records },
];

export function normalizeWorkspaceView(value: string | null | undefined): WorkspaceView {
  return NAV_LINKS.some((link) => link.view === value)
    ? (value as WorkspaceView)
    : "overview";
}

export function CaseInvestigationNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = normalizeWorkspaceView(searchParams.get("view"));

  const selectView = (view: WorkspaceView, targetId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    window.requestAnimationFrame(() => scrollToInvestigationSection(targetId));
  };

  return (
    <nav
      aria-label="案件工作区"
      data-testid="case-investigation-nav"
      className="sticky top-0 z-20 -mx-1 border-b border-[var(--ui-border-subtle)] bg-[var(--ui-surface-primary)]/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-[var(--ui-surface-primary)]/90"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="案件工作区视图">
        {NAV_LINKS.map((link) => {
          const active = activeView === link.view;
          return (
            <button
              key={link.view}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`shrink-0 rounded-[var(--ui-radius-control)] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus-ring)] ${
                active
                  ? "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-hover)]"
                  : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-secondary)] hover:text-[var(--ui-text-primary)]"
              }`}
              onClick={() => selectView(link.view, link.targetId)}
            >
              {link.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
