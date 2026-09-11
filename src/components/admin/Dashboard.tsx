import { Activity, Zap, Plug, Heart, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useExecutions, usePipelines, usePipelineNameIndex, usePlugins, useHealth } from '@/hooks/queries';
import { pipelineNameResolver, formatRelativeTime } from '@/lib/display';
import { ExecutionsChart } from '@/components/admin/ExecutionsChart';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/FeedbackStates';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ── Helpers ──

// ── SummaryCards ──

export function SummaryCards() {
  const pipelines = usePipelines();
  const executions = useExecutions(1, '');
  const plugins = usePlugins();
  const health = useHealth();

  // Three distinguishable health states. While loading there is no verdict
  // yet — showing DEGRADED on a blank poll was a false alarm on every page
  // load. A network error means the engine is unreachable (OFFLINE), which is
  // distinct from the engine self-reporting DEGRADED (amber, matching the
  // top-bar StatusIndicator convention).
  const healthState: 'ok' | 'degraded' | 'offline' | 'loading' = health.isLoading
    ? 'loading'
    : health.isError || !health.data
      ? 'offline'
      : health.data.status;
  const healthValue =
    healthState === 'ok' ? 'OK' : healthState === 'degraded' ? 'DEGRADED' : healthState === 'offline' ? 'OFFLINE' : '—';

  const cards = [
    {
      label: 'Pipelines',
      value: pipelines.data?.total ?? '-',
      icon: Zap,
    },
    {
      label: 'Executions',
      value: executions.data?.total ?? '-',
      icon: Activity,
    },
    {
      label: 'Plugins',
      value: plugins.data?.plugins.length ?? '-',
      icon: Plug,
    },
    {
      label: 'Health',
      value: healthValue,
      icon: Heart,
      health: healthState,
    },
  ];

  const isLoading = pipelines.isLoading || executions.isLoading || plugins.isLoading;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, health: hs }) => (
        <Card key={label} className="bg-surface border-border rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
              {label}
            </span>
            <Icon
              size={16}
              aria-hidden
              className={cn(
                'text-foreground/50',
                hs === 'ok' && 'text-accent',
                hs === 'degraded' && 'text-warning',
                hs === 'offline' && 'text-destructive',
              )}
            />
          </CardHeader>
          <CardContent className="pt-0">
            <div className={cn(
              'font-mono text-2xl font-semibold text-foreground tabular-nums',
              hs === 'degraded' && 'text-warning',
              hs === 'offline' && 'text-destructive',
            )}>
              {isLoading && value === '-' ? (
                <span className="inline-block h-7 w-12 animate-pulse rounded bg-surface-hover align-middle" aria-label="Loading" />
              ) : (
                value
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── RecentExecutions ──

export function RecentExecutions() {
  const { data, isLoading, error, refetch } = useExecutions(1, '');
  // Resolve pipelineId → name so the Pipeline column shows a name, not a UUID.
  const { data: pipelineIndex } = usePipelineNameIndex();
  const resolvePipelineName = pipelineNameResolver(pipelineIndex?.pipelines ?? []);

  if (isLoading) {
    return (
      <Card className="bg-surface border-border rounded-lg">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border pb-3">
          <Clock size={16} className="text-foreground/40" />
          <h3 className="text-sm font-medium text-foreground font-mono">Recent Executions</h3>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              <TableSkeleton rows={5} cols={4} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-surface border-border rounded-lg">
        <CardContent>
          <ErrorState message="Failed to load executions." onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const executions = data?.executions?.slice(0, 10) ?? [];

  return (
    <Card className="bg-surface border-border rounded-lg">
      <CardHeader className="flex flex-row items-center gap-2 border-b border-border pb-3">
        <Clock size={16} className="text-foreground/40" />
        <h3 className="text-sm font-medium text-foreground font-mono">Recent Executions</h3>
        {/* Bridge glance → drill-down: the card is a slice of 10; the full
            table (filters, pagination, per-node detail) is one click away. */}
        <Link
          to="/executions"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          View all
          <ArrowRight size={12} aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-xs font-medium text-foreground/50 px-4 py-2 w-10">
                #
              </TableHead>
              <TableHead className="text-xs font-medium text-foreground/50 px-4 py-2">
                Pipeline
              </TableHead>
              <TableHead className="text-xs font-medium text-foreground/50 px-4 py-2">
                Status
              </TableHead>
              <TableHead className="text-xs font-medium text-foreground/50 px-4 py-2">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState
                    title="No executions yet"
                    hint="Submit a pipeline from the Designer — runs will appear here."
                    actionTo="/"
                    actionLabel="Go to Designer"
                  />
                </TableCell>
              </TableRow>
            ) : (
              executions.map((e, idx) => (
                <TableRow
                  key={e.id}
                  className="border-border/50 hover:bg-surface-hover"
                >
                  <TableCell className="px-4 py-2.5 text-xs text-foreground/40 font-mono" title={e.id}>
                    #{idx + 1}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/80 text-sm font-medium" title={e.pipelineId}>
                    {resolvePipelineName(e.pipelineId)}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/50 text-sm font-mono tabular-nums">
                    {formatRelativeTime(e.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Dashboard (composed) ──

export function Dashboard() {
  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <SummaryCards />
      <ExecutionsChart />
      <RecentExecutions />
    </div>
  );
}
