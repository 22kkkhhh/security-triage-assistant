"use client";

import { useState } from "react";
import { caseA, caseB } from "@/domain/demo";
import { buildSecurityCaseDraft } from "@/services/normalization/buildSecurityCase";
import type { NormalizedSecurityInput } from "@/services/normalization/types";
import { Workbench, type WorkbenchCase } from "./Workbench";
import { ImportFlow } from "./import/ImportFlow";
import { ReportEditor, type ReportSession } from "./report/ReportEditor";

const demoCaseOptions: WorkbenchCase[] = [
  { key: "a", draft: caseA, hint: "技术异常但授权合法" },
  { key: "b", draft: caseB, hint: "疑似安全事件" },
];

let importedSequence = 0;

type View = "import" | "workbench" | "report";

/**
 * 应用入口：新建研判（导入 → 标准化 → 人工确认）→ 研判工作台 → 报告编辑。
 */
export function App() {
  const [view, setView] = useState<View>("import");
  const [cases, setCases] = useState<WorkbenchCase[]>(demoCaseOptions);
  const [activeKey, setActiveKey] = useState("a");
  const [reportSession, setReportSession] = useState<ReportSession | null>(null);

  const handleConfirmed = (input: NormalizedSecurityInput) => {
    importedSequence += 1;
    const key = `imported-${importedSequence}`;
    const draft = buildSecurityCaseDraft(input, key);
    setCases((prev) => [...prev, { key, draft, hint: "导入案件" }]);
    setActiveKey(key);
    setView("workbench");
  };

  const handleGenerateReport = (session: ReportSession) => {
    setReportSession(session);
    setView("report");
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      {view !== "workbench" && (
        <header className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div>
              <div className="text-base font-semibold">
                Security Triage Assistant
              </div>
              <div className="text-xs text-slate-400">
                数据与网络安全联合研判及报告助手 · 演示环境（全部数据为虚构）
              </div>
            </div>
            {view === "import" && (
              <button
                type="button"
                onClick={() => setView("workbench")}
                className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
              >
                直接进入工作台（Demo 案件）
              </button>
            )}
          </div>
        </header>
      )}

      {view === "import" && (
        <main className="mx-auto max-w-7xl space-y-4 px-6 py-4">
          <h1 className="text-lg font-semibold text-neutral-900">新建研判</h1>
          <ImportFlow onConfirmed={handleConfirmed} />
        </main>
      )}

      {view === "workbench" && (
        <Workbench
          cases={cases}
          activeKey={activeKey}
          onSelectCase={setActiveKey}
          onExit={() => setView("import")}
          onGenerateReport={handleGenerateReport}
        />
      )}

      {view === "report" && reportSession && (
        <main className="mx-auto max-w-5xl px-6 py-4">
          <ReportEditor
            session={reportSession}
            onBack={() => setView("workbench")}
          />
        </main>
      )}
    </div>
  );
}
