import type { ReactNode } from "react";

export function EmptyState({ title, description, icon, action }: { title: string; description: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="status">
      {icon ? <div className="mb-3 text-[var(--ui-text-muted)]" aria-hidden="true">{icon}</div> : null}
      <p className="text-sm font-medium text-[var(--ui-text-primary)]">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-5 text-[var(--ui-text-secondary)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
