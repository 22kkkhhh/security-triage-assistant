import {
  businessLegitimacyLabels,
  evidenceConfidenceLabels,
} from "@/domain/labels";
import type { SuggestedAssessment } from "@/domain/types";
import { RiskBadge, StatusBadge } from "./common";

/**
 * 系统综合研判建议栏：只展示维度风险与建议等级，
 * 不展示任何精确攻击概率。
 */
export function SuggestedAssessmentBar({
  assessment,
}: {
  assessment: SuggestedAssessment;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white">
      <div className="grid grid-cols-2 divide-x divide-neutral-100 sm:grid-cols-3 lg:grid-cols-6">
        <div className="px-4 py-3">
          <div className="text-xs text-neutral-500">数据风险</div>
          <div className="mt-1.5">
            <StatusBadge status={assessment.data.status} />
            {assessment.data.riskLevel && (
              <span className="ml-1"><RiskBadge level={assessment.data.riskLevel} /></span>
            )}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-neutral-500">网络风险</div>
          <div className="mt-1.5">
            <StatusBadge status={assessment.network.status} />
            {assessment.network.riskLevel && (
              <span className="ml-1"><RiskBadge level={assessment.network.riskLevel} /></span>
            )}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-neutral-500">身份风险</div>
          <div className="mt-1.5">
            <StatusBadge status={assessment.identity.status} />
            {assessment.identity.riskLevel && (
              <span className="ml-1"><RiskBadge level={assessment.identity.riskLevel} /></span>
            )}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-neutral-500">业务合理性</div>
          <div className="mt-1.5 text-sm font-medium text-neutral-900">
            {businessLegitimacyLabels[assessment.businessLegitimacy]}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-neutral-500">证据完整度</div>
          <div className="mt-1.5 text-sm font-medium text-neutral-900">
            {evidenceConfidenceLabels[assessment.evidenceConfidence]}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-xs text-neutral-500">建议风险等级</div>
          <div className="mt-1.5">
            <RiskBadge level={assessment.suggestedRiskLevel} />
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-100 px-4 py-2.5">
        <p className="text-sm text-neutral-700">
          <span className="font-medium">系统建议：</span>
          {assessment.summary}
        </p>
      </div>
    </div>
  );
}
