/**
 * v1.10-M2：少量页面宽度与按钮层级约定（非设计系统）。
 * AppShell 提供外层 max-w-7xl；页面按用途再收窄。
 */

export const pageWidth = {
  /** 列表 / 新建 / 报告中心等普通业务页 */
  normal: "mx-auto w-full max-w-5xl",
  /** 对比 / 工作台类稍宽工作区 */
  wide: "mx-auto w-full max-w-6xl",
  /** 报告编辑与预览阅读宽度 */
  document: "mx-auto w-full max-w-3xl",
} as const;

export type PageWidth = keyof typeof pageWidth;

/** 全站按钮视觉层级：每区域原则上 ≤ 1 primary */
export const actionClass = {
  primary:
    "inline-flex items-center justify-center rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-40",
  secondary:
    "inline-flex items-center justify-center rounded border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-40",
  tertiary:
    "text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
  danger:
    "inline-flex items-center justify-center rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400",
} as const;
