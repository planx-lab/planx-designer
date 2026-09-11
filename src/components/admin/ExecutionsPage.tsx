import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { useExecutions, usePipelineNameIndex } from '@/hooks/queries';
import type { ExecutionRecord } from '@/types/admin';
import { pipelineNameResolver, formatDateTime } from '@/lib/display';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/FeedbackStates';
import { ExecutionProgressPanel } from '@/components/admin/ExecutionProgressPanel';

const STATUSES: (ExecutionRecord['status'] | '')[] = ['', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'];

const COL_COUNT = 7;

/** Per-node statuses inside an expanded row — the Flow B drill-down
 *  (unified-ui-design.md §4.3): see WHICH node failed, not just that the run did. */
function NodeStatusList({ nodeStatuses }: { nodeStatuses: NonNullable<ExecutionRecord['nodeStatuses']> }) {
  const entries = Object.entries(nodeStatuses);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([nodeId, ns]) => (
        <span
          key={nodeId}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono ${
            ns.status === 'completed'
              ? 'border-accent/30 bg-accent/10 text-accent'
              : ns.status === 'failed'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-info/30 bg-info/10 text-info'
          }`}
        >
          <span className="font-semibold">{nodeId}</span>
          <span className="opacity-70">·</span>
          <span>{ns.status}</span>
          {ns.error && <span className="opacity-70 truncate max-w-[240px]" title={ns.error}>· {ns.error}</span>}
        </span>
      ))}
    </div>
  );
}

export function ExecutionsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ExecutionRecord['status'] | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useExecutions(page, statusFilter);
  // Resolve pipelineId → human-readable name so the PIPELINE column never shows
  // a raw UUID. Falls back to a short id slice for unknown/unnamed pipelines.
  const { data: pipelineIndex } = usePipelineNameIndex();
  const resolvePipelineName = pipelineNameResolver(pipelineIndex?.pipelines ?? []);

  if (error) {
    return (
      <div className="p-6">
        <ErrorState
          message="Failed to load executions."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const executions = data?.executions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="p-6 space-y-4 h-full overflow-y-auto">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter executions by status">
        <span className="text-xs text-foreground/50 uppercase tracking-wide font-medium">Filter:</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            aria-pressed={s === statusFilter}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              s === statusFilter
                ? 'bg-accent/20 text-accent'
                : 'bg-surface text-foreground/50 hover:text-foreground/80'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
        <span className="ml-auto text-xs text-foreground/40 font-mono tabular-nums">
          {total} total
        </span>
      </div>

      {/* Table */}
      <Card className="bg-surface border-border rounded-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-8 px-4 py-2.5" />
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5 w-10">
                  #
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Pipeline
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Status
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Error
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Created
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Finished
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton cols={COL_COUNT} />}
              {!isLoading && executions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COL_COUNT}>
                    <EmptyState
                      title={statusFilter ? `No ${statusFilter.toLowerCase()} executions` : 'No executions yet'}
                      hint={
                        statusFilter
                          ? 'Try a different status filter, or clear it to see all runs.'
                          : 'Build a pipeline in the Designer and submit it — runs will appear here.'
                      }
                      actionTo={statusFilter ? undefined : '/'}
                      actionLabel={statusFilter ? undefined : 'Go to Designer'}
                    />
                  </TableCell>
                </TableRow>
              )}
              {executions.map((e, idx) => {
                const expanded = expandedId === e.id;
                return (
                  <Fragment key={e.id}>
                    <TableRow
                      onClick={() => setExpandedId(expanded ? null : e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setExpandedId(expanded ? null : e.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      aria-label={`Execution of ${resolvePipelineName(e.pipelineId)}, ${e.status}, click to ${expanded ? 'collapse' : 'expand'} details`}
                      className="border-border/50 hover:bg-surface-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      <TableCell className="px-4 py-2.5 w-8">
                        {expanded ? (
                          <ChevronDown size={14} className="text-foreground/50" aria-hidden />
                        ) : (
                          <ChevronRight size={14} className="text-foreground/50" aria-hidden />
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-xs text-foreground/40 font-mono" title={e.id}>
                        #{idx + 1 + (page - 1) * 20}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-foreground/80 text-sm font-medium" title={e.pipelineId}>
                        {resolvePipelineName(e.pipelineId)}
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <StatusBadge status={e.status} />
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-xs text-destructive max-w-[320px]">
                        {e.error ? (
                          // Truncated in the row; the full message lives in the expanded detail.
                          <span className="block truncate">{e.error}</span>
                        ) : (
                          <span className="text-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-foreground/50 text-xs whitespace-nowrap font-mono tabular-nums">
                        {formatDateTime(e.createdAt)}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-foreground/50 text-xs whitespace-nowrap font-mono tabular-nums">
                        {formatDateTime(e.finishedAt)}
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={COL_COUNT} className="bg-muted/30 px-8 py-3">
                          <div className="space-y-2">
                            <p className="text-xs text-foreground/40 font-medium">Node statuses:</p>
                            {e.nodeStatuses && Object.keys(e.nodeStatuses).length > 0 ? (
                              <NodeStatusList nodeStatuses={e.nodeStatuses} />
                            ) : (
                              <p className="text-xs text-foreground/30">
                                No per-node statuses reported for this run.
                              </p>
                            )}
                            <ExecutionProgressPanel executionId={e.id} />
                            {e.error && (
                              <div>
                                <p className="text-xs text-foreground/40 font-medium mb-1">Full error:</p>
                                <p className="text-xs text-destructive/90 break-words whitespace-normal font-mono bg-destructive/5 border border-destructive/20 rounded-md p-2">
                                  {e.error}
                                </p>
                              </div>
                            )}
                            <p className="text-[11px] text-foreground/30 font-mono pt-1">
                              execution {e.id}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground/50 font-mono tabular-nums" aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
            className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
