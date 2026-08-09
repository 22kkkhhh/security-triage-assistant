/**
 * v1.5 Workstream A：Investigation Context Resolver（Service contract）。
 *
 * 对外暴露 Case 调查上下文 catalog 解析；复用 Domain catalog 与
 * resolveMissingContext / ContextRequirement 机制，不引入第二套 missing 判断。
 */
import type { ContextRequirement } from "@/domain/knowledge";
import { resolveMissingContext } from "@/domain/knowledge";
import {
  CONTEXT_MODEL_GAPS,
  INVESTIGATION_CONTEXT_CATALOG,
  INVESTIGATION_CONTEXT_CATALOG_BY_KEY,
  collectInvestigationContextAvailableKeys,
  resolveInvestigationContextState,
  type ContextModelGap,
  type InvestigationContextEntry,
  type InvestigationContextKey,
  type InvestigationContextState,
} from "@/domain/investigationContext";
import type { SecurityCase, SecurityCaseDraft } from "@/domain/types";

export type ResolveInvestigationContextOptions = {
  /** 额外 ContextRequirement（如 pack control 所需）；用于计算 missingRequirements */
  requirements?: readonly ContextRequirement[];
};

export type InvestigationContextResolution = InvestigationContextState & {
  /** 相对 requirements 仍缺失的 ContextRequirement（复用 resolveMissingContext） */
  missingRequirements: ContextRequirement[];
  /** Catalog 中标记为 COMPLIANCE runtime 使用的 key */
  complianceRuntimeKeys: InvestigationContextKey[];
  /** Catalog 中标记为 SECURITY runtime 使用的 key */
  securityRuntimeKeys: InvestigationContextKey[];
};

export {
  CONTEXT_MODEL_GAPS,
  INVESTIGATION_CONTEXT_CATALOG,
  INVESTIGATION_CONTEXT_CATALOG_BY_KEY,
  collectInvestigationContextAvailableKeys,
  resolveInvestigationContextState,
  type ContextModelGap,
  type InvestigationContextEntry,
  type InvestigationContextKey,
  type InvestigationContextState,
};

/**
 * 解析 Case 当前 Investigation Context catalog 状态。
 * availableKeys 与 collectAvailableContextKeys（compliance 路径）语义一致。
 */
export function resolveInvestigationContext(
  draft: SecurityCaseDraft | SecurityCase,
  options?: ResolveInvestigationContextOptions,
): InvestigationContextResolution {
  const state = resolveInvestigationContextState(draft);
  const missingRequirements = options?.requirements
    ? resolveMissingContext([...options.requirements], state.availableKeys)
    : [];

  const complianceRuntimeKeys = INVESTIGATION_CONTEXT_CATALOG.filter((d) =>
    d.runtimeConsumers.includes("COMPLIANCE"),
  ).map((d) => d.key);

  const securityRuntimeKeys = INVESTIGATION_CONTEXT_CATALOG.filter((d) =>
    d.runtimeConsumers.includes("SECURITY"),
  ).map((d) => d.key);

  return {
    ...state,
    missingRequirements,
    complianceRuntimeKeys,
    securityRuntimeKeys,
  };
}
