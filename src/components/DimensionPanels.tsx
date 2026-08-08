import { displayRiskLevel } from "@/domain/labels";
import type { SecurityCase } from "@/domain/types";
import { formatDateTimesInDisplayText } from "@/lib/formatDateTimeForDisplay";
import { Field, StatusBadge } from "./common";

/**
 * 三维安全分析：数据 / 网络 / 身份。
 * 每块展示关键上下文字段、相关规则与证据摘要，而非字段堆砌。
 */

function RuleList({
  securityCase,
  category,
}: {
  securityCase: SecurityCase;
  category: "DATA" | "NETWORK" | "IDENTITY";
}) {
  const results = securityCase.analysisResults.filter(
    (r) => r.category === category,
  );
  return (
    <ul className="space-y-2">
      {results.map((result) => (
        <li key={result.ruleId} className="rounded bg-neutral-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-neutral-400">
              {result.ruleId}
            </span>
            <span className="text-sm font-medium text-neutral-900">
              {result.title}
            </span>
            <StatusBadge status={result.status} />
            <span className="text-xs text-neutral-500">
              {displayRiskLevel(result.status, result.riskLevel)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            {formatDateTimesInDisplayText(result.explanation)}
          </p>
          {result.evidenceIds.length > 0 && (
            <div className="mt-1 space-y-1">
              {result.evidenceIds.map((id) => {
                const evidence = securityCase.evidences.find(
                  (e) => e.evidenceId === id,
                );
                if (!evidence) return null;
                return (
                  <p
                    key={id}
                    className="border-l-2 border-neutral-300 pl-2 text-xs leading-5 text-neutral-500"
                  >
                    证据 {id}：
                    {formatDateTimesInDisplayText(evidence.summary)}
                  </p>
                );
              })}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function DimensionPanels({
  securityCase,
}: {
  securityCase: SecurityCase;
}) {
  const { dataContext, networkContext, identityContext, suggestedAssessment } =
    securityCase;

  const baseline = dataContext.baseline;
  const accessed = dataContext.accessedRecordCount;
  const average = baseline?.averageRecordCount ?? null;
  const deviationRatio =
    accessed !== null && average !== null && average > 0
      ? accessed / average
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-md border border-neutral-200 bg-white">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-neutral-900">
            数据安全分析
          </h2>
          {suggestedAssessment && (
            <StatusBadge status={suggestedAssessment.data.status} />
          )}
        </header>
        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-3 gap-2 rounded bg-neutral-50 px-3 py-2 text-center">
            <div>
              <div className="text-xs text-neutral-500">本次访问量</div>
              <div className="mt-0.5 text-sm font-semibold text-neutral-900">
                {dataContext.accessedRecordCount?.toLocaleString() ?? "（无数据）"}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">
                历史{baseline?.observationDays ?? ""}日平均
              </div>
              <div className="mt-0.5 text-sm font-semibold text-neutral-900">
                {baseline?.averageRecordCount?.toLocaleString() ?? "（无数据）"}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">偏离倍数</div>
              <div className="mt-0.5 text-sm font-semibold text-neutral-900">
                {deviationRatio === null
                  ? "数据不足，暂无法判断"
                  : `约 ${deviationRatio.toFixed(1)} 倍`}
              </div>
            </div>
          </div>
          <div>
            <Field
              label="数据库 / 表"
              value={`${dataContext.databaseName ?? "未知"}.${dataContext.tableName ?? "未知"}`}
            />
            <Field
              label="涉及敏感字段"
              value={
                dataContext.sensitiveFieldTypes.length > 0
                  ? dataContext.sensitiveFieldTypes.join("、")
                  : null
              }
            />
          </div>
          <RuleList securityCase={securityCase} category="DATA" />
        </div>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-neutral-900">
            网络安全分析
          </h2>
          {suggestedAssessment && (
            <StatusBadge status={suggestedAssessment.network.status} />
          )}
        </header>
        <div className="space-y-3 px-4 py-3">
          <div>
            <Field label="内网来源地址" value={networkContext.internalSourceIp} />
            <Field label="外部通信对端" value={networkContext.externalDestination} />
            <Field
              label="出站流量"
              value={
                networkContext.outboundTransferBytes === null
                  ? null
                  : `约 ${Math.round(networkContext.outboundTransferBytes / 1024 / 1024)}MB`
              }
            />
            <Field label="备注" value={networkContext.note} />
          </div>
          <RuleList securityCase={securityCase} category="NETWORK" />
        </div>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-neutral-900">
            身份行为分析
          </h2>
          {suggestedAssessment && (
            <StatusBadge status={suggestedAssessment.identity.status} />
          )}
        </header>
        <div className="space-y-3 px-4 py-3">
          <div>
            <Field label="账号" value={identityContext.accountName} />
            <Field
              label="连续失败认证次数"
              value={
                identityContext.failedLoginAttempts === null
                  ? null
                  : String(identityContext.failedLoginAttempts)
              }
            />
            <Field label="登录来源地址" value={identityContext.loginSourceIp} />
            <Field
              label="涉及业务系统"
              value={
                identityContext.accessedSystems.length > 0
                  ? identityContext.accessedSystems.join("、")
                  : null
              }
            />
          </div>
          <RuleList securityCase={securityCase} category="IDENTITY" />
        </div>
      </section>
    </div>
  );
}
