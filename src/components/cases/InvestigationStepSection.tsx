import type { ReactNode } from "react";

/**
 * 调查主区域内的步骤壳：①–④ 固定顺序，状态文案弱视觉。
 */
export function InvestigationStepSection({
  id,
  step,
  title,
  statusLabel,
  description,
  children,
  testId,
}: {
  id?: string;
  step: 1 | 2 | 3 | 4;
  title: string;
  statusLabel?: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  const stepLabel = (["①", "②", "③", "④"] as const)[step - 1];

  return (
    <div
      id={id}
      className="scroll-mt-14 space-y-2 border-b border-neutral-100 pb-4 last:border-b-0 last:pb-0"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">
            <span className="mr-1.5 text-neutral-400" aria-hidden="true">
              {stepLabel}
            </span>
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
          ) : null}
        </div>
        {statusLabel ? (
          <span className="shrink-0 text-xs text-neutral-500">{statusLabel}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
