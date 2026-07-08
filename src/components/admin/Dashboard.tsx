import { Activity, Zap, Plug, Heart, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useExecutions, usePipelines, usePlugins, useHealth } from '@/hooks/queries';
import type { ExecutionRecord } from '@/types/admin';
import { ExecutionsChart } from '@/components/admin/ExecutionsChart';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── SummaryCards ──

export function SummaryCards() {
  const pipelines = usePipelines();
  const executions = useExecutions(1, '');
  const plugins = usePlugins();
  const health = useHealth();

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
      value: health.data?.status === 'ok' ? 'OK' : 'DEGRADED',
      icon: Heart,
      healthOk: health.data?.status,
    },
  ];

  const isLoading = pipelines.isLoading || executions.isLoading || plugins.isLoading;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, healthOk }) => (
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
                healthOk === 'ok' && 'text-accent',
                healthOk && healthOk !== 'ok' && 'text-destructive',
              )}
            />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="font-mono text-2xl font-semibold text-foreground tabular-nums">
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

// ── StatusBadge ──

function StatusBadge({ status }: { status: ExecutionRecord['status'] }) {
  switch (status) {
    case 'SUCCEEDED':
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 size={11} aria-hidden />
          SUCCEEDED
        </Badge>
      );
    case 'RUNNING':
      return (
        <Badge
          variant="secondary"
          className="bg-warning/15 text-warning border-warning/20 hover:bg-warning/25 gap-1"
        >
          <Loader2 size={11} className="animate-spin" aria-hidden />
          RUNNING
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle size={11} aria-hidden />
          FAILED
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="outline" className="text-foreground/60 border-foreground/20 gap-1">
          <Clock size={11} aria-hidden />
          PENDING
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-foreground/60 border-foreground/20">
          {status}
        </Badge>
      );
  }
}

// ── RecentExecutions ──

export function RecentExecutions() {
  const { data, isLoading, error } = useExecutions(1, '');

  if (isLoading) {
    return (
      <Card className="bg-surface border-border rounded-lg">
        <CardContent className="h-40 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-surface border-border rounded-lg">
        <CardContent>
          <p className="text-destructive text-sm">Failed to load executions.</p>
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
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-xs font-medium text-foreground/50 px-4 py-2">
                ID
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
                <TableCell
                  colSpan={4}
                  className="px-4 py-8 text-center text-foreground/30 text-sm"
                >
                  No executions yet
                </TableCell>
              </TableRow>
            ) : (
              executions.map((e) => (
                <TableRow
                  key={e.id}
                  className="border-border/50 hover:bg-surface-hover"
                >
                  <TableCell className="px-4 py-2.5 font-mono text-xs text-foreground/50">
                    {e.id.slice(0, 8)}&hellip;
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/80 text-sm">
                    {e.pipelineId}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/40 text-sm">
                    {relativeTime(e.createdAt)}
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
