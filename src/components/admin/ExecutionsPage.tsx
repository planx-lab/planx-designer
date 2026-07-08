import { useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { useExecutions } from '@/hooks/queries';
import type { ExecutionRecord } from '@/types/admin';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

const STATUSES: (ExecutionRecord['status'] | '')[] = ['', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'];

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
          className="bg-warning/15 text-warning border-warning/20 gap-1"
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

export function ExecutionsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ExecutionRecord['status'] | ''>('');
  const { data, isLoading, error } = useExecutions(page, statusFilter);

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive text-sm">Failed to load executions.</p>
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
        <span className="ml-auto text-xs text-foreground/40">
          {total} total
        </span>
      </div>

      {/* Table */}
      <Card className="bg-surface border-border rounded-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  ID
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
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-12 text-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && executions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-12 text-center text-foreground/30 text-sm">
                    No executions yet
                  </TableCell>
                </TableRow>
              )}
              {executions.map((e) => (
                <TableRow key={e.id} className="border-border/50 hover:bg-surface-hover">
                  <TableCell className="px-4 py-2.5 font-mono text-xs text-foreground/50">
                    {e.id.slice(0, 12)}&hellip;
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/80 text-sm">
                    {e.pipelineId}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-destructive max-w-[200px] truncate" title={e.error}>
                    {e.error ?? '—'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/40 text-xs whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-foreground/40 text-xs whitespace-nowrap">
                    {e.finishedAt ? new Date(e.finishedAt).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground/50" aria-live="polite">
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
