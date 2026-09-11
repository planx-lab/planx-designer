import { Fragment, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  FolderOpen,
  Trash2,
  AlertCircle,
  X,
} from 'lucide-react';
import { usePipelines, getTenant } from '@/hooks/queries';
import { getPipelineSpec, deletePipeline } from '@/api/controlPlane';
import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { pipelineDisplayName, formatDateTime } from '@/lib/display';
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
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/FeedbackStates';

const COL_COUNT = 6;

export function PipelinesPage() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedExecs, setExpandedExecs] = useState<ExecutionRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const expandSeq = useRef(0);

  const { data, isLoading, error, refetch } = usePipelines(page);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadSpec = usePipelineStore((s) => s.loadSpec);

  const handleOpen = async (pipelineId: string) => {
    const tenantId = getTenant();
    try {
      const detail = await getPipelineSpec(pipelineId, tenantId);
      loadSpec(detail.specification, detail.pipelineId, detail.revision);
      // Reset stale submit/save indicators left over from the previous canvas.
      // Without this, opening pipeline B after submitting pipeline A would keep
      // showing "Submitted · A" on an unrelated pipeline (I3). Mirrors handleNew.
      useUIStore.getState().setSubmitStatus('idle');
      useUIStore.getState().setSaveStatus('idle');
      setErrorMsg(null);
      navigate('/'); // Designer is the root route
    } catch (e) {
      setErrorMsg(`Failed to open pipeline: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleDelete = async (pipelineId: string) => {
    if (!window.confirm('Delete this pipeline? Execution history is kept.')) return;
    setDeleting(pipelineId);
    try {
      const tenantId = getTenant();
      await deletePipeline(pipelineId, tenantId);
      await queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(`Failed to delete: ${e instanceof Error ? e.message : e}`);
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
    setDetailError(null);
    setLoadingDetail(true);
    // Sequence guard: a slow response for pipeline A must not paint its rows
    // into pipeline B's detail if the user toggled again mid-flight.
    const requestToken = ++expandSeq.current;
    try {
      // Server-side per-pipeline filter (engine supports pipelineId on
      // GET /executions) — authoritative across pages, unlike the old
      // client-side filter of one global page which missed older runs.
      const result = await fetchExecutions(1, 5, '', pipelineId);
      if (requestToken !== expandSeq.current) return;
      setExpandedExecs(result.executions ?? []);
    } catch {
      if (requestToken !== expandSeq.current) return;
      setDetailError('Failed to load executions for this pipeline.');
    }
    if (requestToken === expandSeq.current) setLoadingDetail(false);
  };

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load pipelines." onRetry={() => refetch()} />
      </div>
    );
  }

  const pipelines = data?.pipelines ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="p-6 space-y-4 h-full overflow-y-auto">
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
        >
          <AlertCircle size={15} className="text-destructive shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-destructive/90 break-words whitespace-normal flex-1">
            {errorMsg}
          </p>
          <button
            onClick={() => setErrorMsg(null)}
            aria-label="Dismiss error"
            className="text-destructive/60 hover:text-destructive shrink-0 mt-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <Card className="bg-surface border-border rounded-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="w-8 px-4 py-2.5" />
                <TableHead className="text-xs font-medium text-foreground/50 uppercase tracking-wide px-4 py-2.5">
                  Pipeline
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
              {isLoading && <TableSkeleton cols={COL_COUNT} />}
              {!isLoading && pipelines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COL_COUNT}>
                    <EmptyState
                      title="No pipelines yet"
                      hint="Pipelines appear here once you submit one from the Designer."
                      actionTo="/"
                      actionLabel="Go to Designer"
                    />
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
                    aria-label={`Pipeline ${pipelineDisplayName(p.name, p.pipelineId)}, ${p.executionCount ?? 0} executions, click to ${expanded === p.pipelineId ? 'collapse' : 'expand'}`}
                    className="border-border/50 hover:bg-surface-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    <TableCell className="px-4 py-3 w-8">
                      {expanded === p.pipelineId ? (
                        <ChevronDown size={14} className="text-foreground/50" aria-hidden />
                      ) : (
                        <ChevronRight size={14} className="text-foreground/50" aria-hidden />
                      )}
                    </TableCell>
                    <TableCell
                      className="px-4 py-3 text-foreground/80 font-medium text-sm"
                      title={p.pipelineId}
                    >
                      {pipelineDisplayName(p.name, p.pipelineId)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={p.lastStatus} />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-foreground/60 text-sm font-mono tabular-nums">
                      {p.executionCount ?? 0}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-foreground/50 text-xs whitespace-nowrap font-mono tabular-nums">
                      {formatDateTime(p.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpen(p.pipelineId)}
                          className="p-1 rounded text-foreground/60 hover:text-accent hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Open in Designer"
                          aria-label={`Open pipeline ${pipelineDisplayName(p.name, p.pipelineId)} in Designer`}
                        >
                          <FolderOpen size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.pipelineId)}
                          disabled={deleting === p.pipelineId}
                          className="p-1 rounded text-foreground/60 hover:text-destructive hover:bg-surface-hover transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Delete pipeline"
                          aria-label={`Delete pipeline ${pipelineDisplayName(p.name, p.pipelineId)}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {/* Expanded row: recent executions */}
                  {expanded === p.pipelineId && (
                    <TableRow key={`${p.pipelineId}-detail`}>
                      <TableCell colSpan={COL_COUNT} className="bg-muted/30 px-8 py-3">
                        {loadingDetail ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        ) : detailError ? (
                          <p className="text-xs text-destructive/90">{detailError}</p>
                        ) : expandedExecs.length === 0 ? (
                          <p className="text-xs text-foreground/40">No executions for this pipeline yet</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-foreground/40 mb-2 font-medium">Recent executions:</p>
                            {expandedExecs.map((e) => (
                              <div key={e.id} className="flex items-start gap-4 text-xs">
                                <StatusBadge status={e.status} />
                                <span className="text-foreground/50 whitespace-nowrap pt-0.5 font-mono tabular-nums">{formatDateTime(e.createdAt)}</span>
                                {e.error && (
                                  <span
                                    className="text-destructive/80 break-words whitespace-normal max-h-24 overflow-y-auto flex-1"
                                    title={e.error}
                                  >
                                    {e.error}
                                  </span>
                                )}
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
