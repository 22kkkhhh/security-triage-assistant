import type { ReactNode } from "react";

/**
 * 工作台统一 section shell：标题层级与间距一致，避免 card-in-card。
 */
export function WorkbenchSection({
  id,
  title,
  description,
  meta,
  children,
  testId,
  hidden = false,
  "aria-label": ariaLabel,
}: {
  id?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  testId?: string;
  hidden?: boolean;
  "aria-label"?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-14 space-y-3"
      hidden={hidden}
      aria-hidden={hidden || undefined}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-neutral-200 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
          ) : null}
        </div>
        {meta ? <div className="shrink-0 text-xs text-neutral-500">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}
