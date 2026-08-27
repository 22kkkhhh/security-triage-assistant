import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "compact" | "default" | "important";

const variantClass: Record<ButtonVariant, string> = {
  primary: "ui-button-primary",
  secondary: "ui-button-secondary",
  ghost: "ui-button-ghost",
  danger: "ui-button-danger",
};

const sizeClass: Record<ButtonSize, string> = {
  compact: "min-h-8 px-3",
  default: "",
  important: "min-h-10",
};

export function Button({ variant = "secondary", size = "default", loading = false, children, className = "", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; children: ReactNode }) {
  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={`ui-button ${variantClass[variant]} ${sizeClass[size]} ${className}`.trim()}>
      {loading ? "处理中…" : children}
    </button>
  );
}
