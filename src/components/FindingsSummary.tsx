import { displayRiskLevel } from "@/domain/labels";
import type { AnalysisResult } from "@/domain/types";
import { Panel, StatusBadge, statusStyle } from "./common";

/**
 * 异常行为摘要：同时展示 ABNORMAL 与 UNKNOWN 结果，
 * UNKNOWN 绝不渲染为“正常”。
 */
export function FindingsSummary({ results }: { results: AnalysisResult[] }) {
  const findings = results.filter((r) => r.status !== "NORMAL");

  return (
    <Panel title={`异常与待确认行为摘要（${findings.length} 项）`}>
      {findings.length === 0 ? (
        <p className="text-sm text-neutral-500">当前未见异常，也无待确认事项。</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {findings.map((result) => (
            <li
              key={result.ruleId}
              className={`rounded border-l-4 px-3 py-2 ${statusStyle[result.status]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{result.title}</span>
                <StatusBadge status={result.status} />
                <span className="text-xs">
                  {displayRiskLevel(result.status, result.riskLevel)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 opacity-90">
                {result.explanation}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
