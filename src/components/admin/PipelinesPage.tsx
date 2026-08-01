import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import { usePipelines, getTenant } from '@/hooks/queries';
import { getPipelineSpec, deletePipeline } from '@/api/controlPlane';
import { usePipelineStore } from '@/stores/usePipelineStore';
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
import { fetchExecutions } from '@/api/engine';
import type { ExecutionRecord } from '@/types/admin';

function StatusBadge({ status }: { status: string }) {
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
          {status || '—'}
        </Badge>
      );
  }
}

export function PipelinesPage() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedExecs, setExpandedExecs] = useState<ExecutionRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data, isLoading, error } = usePipelines(page);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadSpec = usePipelineStore((s) => s.loadSpec);

  const handleOpen = async (pipelineId: string) => {
    const tenantId = getTenant();
    try {
      const detail = await getPipelineSpec(pipelineId, tenantId);
      loadSpec(detail.specification, detail.pipelineId);
      navigate('/'); // Designer is the root route
    } catch (e) {
      alert(`Failed to open pipeline: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleDelete = async (pipelineId: string) => {
    if (!window.confirm('Delete this pipeline? Execution history is kept.')) return;
    setDeleting(pipelineId);
    try {
      const tenantId = getTenant();
      await deletePipeline(pipelineId, tenantId);
      await queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    } catch (e) {
      alert(`Failed to delete: ${e instanceof Error ? e.message : e}`);
    } finally {
      setDeleting(null);
    }
  };

  const toggleExpand = async (pipelineId: string) => {
    if (expanded === pipelineId) {
      setExpanded(null);
      setExpandedExecs([]);
      return;
    }
    setExpanded(pipelineId);
    setExpandedExecs([]);
    setLoadingDetail(true);
    try {
      const execs = await fetchExecutions(1, 5);
      const filtered = execs.executions
        ?.filter((e) => e.pipelineId === pipelineId)
        .slice(0, 5) ?? [];
      setExpandedExecs(filtered);
    } catch {
      setExpandedExecs([]);
    }
    setLoadingDetail(false);
  };

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive text-sm">Failed to load pipelines.</p>
      </div>
    );
  }

  const pipelines = data?.pipelines ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="p-6 space-y-4 h-full overflow-y-auto">
      <Card className="bg-surface border-border rounded-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-8 px-4 py-2.5" />
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Pipeline ID
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Last Status
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Executions
                </TableHead>
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Created
                </TableHead>
                <TableHead className="w-px px-3 py-2.5" />
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
              {!isLoading && pipelines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-12 text-center text-foreground/30 text-sm">
                    No pipelines yet
                  </TableCell>
                </TableRow>
              )}
              {pipelines.map((p) => (
                <Fragment key={p.pipelineId}>
                  <TableRow
                    onClick={() => toggleExpand(p.pipelineId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(p.pipelineId);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded === p.pipelineId}
                    aria-label={`Pipeline ${p.pipelineId}, ${p.executionCount ?? 0} executions, click to ${expanded === p.pipelineId ? 'collapse' : 'expand'}`}
                    className="border-border/50 hover:bg-surface-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    <TableCell className="px-4 py-3 w-8">
                      {expanded === p.pipelineId ? (
                        <ChevronDown size={14} className="text-foreground/50" aria-hidden />
                      ) : (
                        <ChevronRight size={14} className="text-foreground/50" aria-hidden />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-foreground/80 font-medium text-sm font-mono">
                      {p.pipelineId}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={p.lastStatus} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-foreground/60 text-sm">
                      {p.executionCount ?? 0}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-foreground/50 text-xs whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpen(p.pipelineId)}
                          className="p-1 rounded text-foreground/60 hover:text-accent hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Open in Designer"
                          aria-label={`Open pipeline ${p.pipelineId} in Designer`}
                        >
                          <FolderOpen size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.pipelineId)}
                          disabled={deleting === p.pipelineId}
                          className="p-1 rounded text-foreground/60 hover:text-destructive hover:bg-surface-hover transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Delete pipeline"
                          aria-label={`Delete pipeline ${p.pipelineId}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {/* Expanded row: recent executions */}
                  {expanded === p.pipelineId && (
                    <TableRow key={`${p.pipelineId}-detail`}>
                      <TableCell colSpan={6} className="bg-muted/30 px-8 py-3">
                        {loadingDetail ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        ) : expandedExecs.length === 0 ? (
                          <p className="text-xs text-foreground/30">No executions</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-foreground/40 mb-2 font-medium">Recent executions:</p>
                            {expandedExecs.map((e) => (
                              <div key={e.id} className="flex items-center gap-4 text-xs">
                                <span className="font-mono text-foreground/40 w-20 truncate">
                                  {e.id.slice(0, 8)}&hellip;
                                </span>
                                <StatusBadge status={e.status} />
                                <span className="text-foreground/30">{new Date(e.createdAt).toLocaleTimeString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
