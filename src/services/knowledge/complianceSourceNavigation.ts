/**
 * v1.4 Step 7：官方来源 URL 校验与条款导航解析（纯函数）。
 * URL 必须来自 pack/persisted provenance；禁止前端硬编码法规地址；禁止伪造条款锚点。
 */
import type { ContentMode } from "@/domain/knowledge";

/** 已批准官方域名（含其子域）；与 docs/law/SOURCES.md 对齐 */
export const APPROVED_OFFICIAL_SOURCE_DOMAINS = [
  "npc.gov.cn",
  "gov.cn",
  "samr.gov.cn",
  "openstd.samr.gov.cn",
] as const;

export const COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE = "暂无可用官方来源链接";

export type ComplianceSourceTargetKind =
  | "DOCUMENT_PAGE"
  | "CLAUSE_ANCHOR"
  | "NONE";

export type ComplianceSourceNavigation = {
  /** 校验通过后的可打开 URL；不可用时为 null */
  href: string | null;
  available: boolean;
  targetKind: ComplianceSourceTargetKind;
  /** 主操作文案：仅「查看官方来源」，SUMMARY_ONLY 不提供原文条款入口 */
  actionLabel: string;
  /** 是否允许展示「查看原文条款」类入口（SUMMARY_ONLY / GB/T 恒为 false） */
  allowsOriginalClauseView: boolean;
  emptyMessage: string;
};

function isApprovedOfficialHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return false;
  }
  return APPROVED_OFFICIAL_SOURCE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/**
 * 校验官方来源 URL：仅 http/https + 批准域名；拒绝凭据与非法协议。
 * 保留 pack 自带的 hash（若有）；本函数不追加任何锚点。
 */
export function sanitizeOfficialSourceUrl(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!isApprovedOfficialHost(url.hostname)) return null;

  return url.toString();
}

export function isSummaryOnlyContent(input: {
  contentMode: ContentMode;
  documentCanonicalCode: string;
}): boolean {
  return (
    input.contentMode === "SUMMARY_ONLY" ||
    input.contentMode === "METADATA_ONLY" ||
    input.documentCanonicalCode.startsWith("CN-GBT-")
  );
}

/**
 * 解析可导航官方来源。
 * - 优先使用 pack 提供的 clauseSourceUrl（仅当其已含稳定锚点且通过校验）
 * - 否则使用文档级 sourceUrl（文档页，不伪造 #clause）
 * - SUMMARY_ONLY / GB/T：只允许官方元数据/公开来源页，不允许「查看原文条款」
 */
export function resolveComplianceSourceNavigation(input: {
  sourceUrl: string | null | undefined;
  contentMode: ContentMode;
  documentCanonicalCode: string;
  /** 可选：pack 已给出的条款级 URL；不得由调用方拼造 */
  clauseSourceUrl?: string | null;
}): ComplianceSourceNavigation {
  const summaryOnly = isSummaryOnlyContent(input);
  const allowsOriginalClauseView = !summaryOnly;

  const clauseHref = sanitizeOfficialSourceUrl(input.clauseSourceUrl);
  if (clauseHref && !summaryOnly) {
    let hasStableAnchor = false;
    try {
      const u = new URL(clauseHref);
      hasStableAnchor = u.hash.length > 1;
    } catch {
      hasStableAnchor = false;
    }
    if (hasStableAnchor) {
      return {
        href: clauseHref,
        available: true,
        targetKind: "CLAUSE_ANCHOR",
        actionLabel: "查看官方来源",
        allowsOriginalClauseView,
        emptyMessage: COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE,
      };
    }
  }

  const docHref = sanitizeOfficialSourceUrl(input.sourceUrl);
  if (docHref) {
    return {
      href: docHref,
      available: true,
      targetKind: "DOCUMENT_PAGE",
      actionLabel: "查看官方来源",
      allowsOriginalClauseView,
      emptyMessage: COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE,
    };
  }

  return {
    href: null,
    available: false,
    targetKind: "NONE",
    actionLabel: "查看官方来源",
    allowsOriginalClauseView,
    emptyMessage: COMPLIANCE_SOURCE_UNAVAILABLE_MESSAGE,
  };
}
