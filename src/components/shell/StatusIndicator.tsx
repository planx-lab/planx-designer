import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useHealth } from '@/hooks/queries';

/**
 * Live engine-health indicator for the top bar. Reuses the shared `useHealth`
 * query (polls /api/healthz every 5s) and maps the result to a colored dot +
 * label using the existing semantic status tokens:
 *   compatible ok -> accent (green)
 *   incompatible / degraded -> warning (amber)
 *   loading / network error -> destructive (red)
 *
 * The green/amber/red convention matches PipelineToolbar's execution-status
 * badges (unified-ui-design.md §4.2/§4.4).
 */
export function StatusIndicator() {
  const { data, isLoading, isError } = useHealth();

  // Reachability alone does not make an older Engine ready for managed flows.
  // Preserve loading, degradation and transport errors as distinct states.
  const incompatible = data?.pipelineWorkflow !== 'draft-v1' || data?.connectionWorkflow !== 'managed-v1';
  const state: 'ok' | 'degraded' | 'down' | 'checking' | 'incompatible' =
    isLoading ? 'checking' : isError || !data ? 'down'
      : data.status === 'ok' && incompatible ? 'incompatible' : data.status;

  const config = {
    ok: {
      Icon: CheckCircle2,
      label: 'Ready',
      className: 'text-accent',
      title: 'Engine is ready',
    },
    incompatible: {
      Icon: AlertTriangle,
      label: 'Upgrade required',
      className: 'text-warning',
      title: 'Engine requires draft-v1 and managed-v1 workflows. Update and restart the Engine.',
    },
    degraded: {
      Icon: AlertTriangle,
      label: 'Degraded',
      className: 'text-warning',
      title: data?.error ?? 'Engine is degraded',
    },
    down: {
      Icon: XCircle,
      label: 'Offline',
      className: 'text-destructive',
      title: 'Engine unreachable',
    },
    checking: {
      Icon: XCircle,
      label: '…',
      className: 'text-foreground/50',
      title: 'Checking engine…',
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
      <Icon size={14} aria-hidden className={isError ? 'animate-pulse' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
