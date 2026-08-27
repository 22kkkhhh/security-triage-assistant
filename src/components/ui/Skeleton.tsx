export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-[var(--ui-surface-secondary)] ${className}`.trim()} aria-hidden="true" />;
}
