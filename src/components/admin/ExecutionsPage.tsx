import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
      return <Badge variant="default">SUCCEEDED</Badge>;
    case 'RUNNING':
      return (
        <Badge
          variant="secondary"
          className="bg-warning/15 text-warning border-warning/20"
        >
          RUNNING
        </Badge>
      );
    case 'FAILED':
      return <Badge variant="destructive">FAILED</Badge>;
    default:
      return (
        <Badge variant="outline" className="text-foreground/40 border-foreground/10">
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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-foreground/50 uppercase tracking-wide font-medium">Filter:</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
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
        <span className="text-xs text-foreground/40">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
