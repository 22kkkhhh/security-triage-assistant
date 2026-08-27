/**
 * 页面宽度与按钮层级约定，视觉值统一由 globals.css 的 UI tokens 提供。
 */
export const pageWidth = {
  normal: "mx-auto w-full max-w-7xl",
  wide: "mx-auto w-full max-w-7xl",
  document: "mx-auto w-full max-w-3xl",
} as const;

export type PageWidth = keyof typeof pageWidth;

export const actionClass = {
  primary: "ui-button ui-button-primary",
  secondary: "ui-button ui-button-secondary",
  tertiary: "ui-button ui-button-ghost",
  danger: "ui-button ui-button-danger",
} as const;
