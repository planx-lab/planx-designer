import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useHealth } from '@/hooks/queries';

/**
 * Live engine-health indicator for the top bar. Reuses the shared `useHealth`
 * query (polls /api/healthz every 5s) and maps the result to a colored dot +
 * label using the existing semantic status tokens:
 *   ok        -> accent (green)
 *   degraded  -> warning (amber)
 *   loading / network error -> destructive (red)
 *
 * The green/amber/red convention matches PipelineToolbar's execution-status
 * badges (unified-ui-design.md §4.2/§4.4).
 */
export function StatusIndicator() {
  const { data, isLoading, isError } = useHealth();

  // Derive the three UI states. The HealthResponse type only has ok|degraded;
  // "down" is implied by a query error (network failure / non-2xx).
  const state: 'ok' | 'degraded' | 'down' =
    isLoading || isError || !data ? 'down' : data.status;

  const config = {
    ok: {
      Icon: CheckCircle2,
      label: 'Ready',
      className: 'text-accent',
      title: 'Engine is ready',
    },
    degraded: {
      Icon: AlertTriangle,
      label: 'Degraded',
      className: 'text-warning',
      title: data?.error ?? 'Engine is degraded',
    },
    down: {
      Icon: XCircle,
      label: isError ? 'Offline' : '—',
      className: 'text-destructive',
      title: isError ? 'Engine unreachable' : 'Checking engine…',
    },
  }[state];

  const { Icon, label, className, title } = config;

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium ${className}`}
      title={title}
      role="status"
      aria-label={`Engine status: ${label}`}
    >
      <Icon size={14} aria-hidden className={isError || isLoading ? 'animate-pulse' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
