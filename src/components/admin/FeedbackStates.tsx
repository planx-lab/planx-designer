import type { LucideIcon } from 'lucide-react';
import { Inbox, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Shared empty/error surfaces for the Operate pages. Empty states guide
 * action instead of dead-ending (unified-ui-design.md §4.4): icon + headline
 * + one-line hint + optional link to the next step.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  actionTo,
  actionLabel,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  actionTo?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Icon size={24} className="text-foreground/30 mb-3" aria-hidden />
      <p className="text-sm font-medium text-foreground/70">{title}</p>
      {hint && <p className="text-xs text-foreground/45 mt-1 max-w-[36ch]">{hint}</p>}
      {actionTo && actionLabel && (
        <Link
          to={actionTo}
          className="mt-3 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/** Shared load-failure surface: message + retry. Without a retry button a
 *  transient engine hiccup dead-ends the page until a manual refresh. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <AlertCircle size={24} className="text-destructive/70 mb-3" aria-hidden />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** Skeleton rows for dense table loads — spinners inside tables were replaced
 *  per unified-ui-design.md §4.4 ("skeleton screens, not spinners"). */
export function TableSkeleton({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-border/50" aria-hidden>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 animate-pulse rounded bg-surface-hover"
                style={{ width: j === 0 ? '40%' : `${45 + ((i + j) % 4) * 10}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
