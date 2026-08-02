import { useState, useRef, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Undo2,
  Redo2,
  ExternalLink,
  FilePlus2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { submitPipeline, getExecution } from '@/api/controlPlane';
import type { ExecutionStatus } from '@/api/controlPlane';
import { clearDraft } from '@/lib/draft';

export function PipelineToolbar() {
  const navigate = useNavigate();
  const name = usePipelineStore((s) => s.name);
  const setName = usePipelineStore((s) => s.setName);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const buildSpec = usePipelineStore((s) => s.buildSpec);
  const validate = usePipelineStore((s) => s.validate);
  const nodes = usePipelineStore((s) => s.nodes);
  const setPipelineId = usePipelineStore((s) => s.setPipelineId);
  const reset = usePipelineStore((s) => s.reset);

  const undo = usePipelineStore((s) => s.undo);
  const redo = usePipelineStore((s) => s.redo);
  const _past = usePipelineStore((s) => s._past);
  const _future = usePipelineStore((s) => s._future);
  const showPreview = useUIStore((s) => s.showPreview);
  const togglePreview = useUIStore((s) => s.togglePreview);
  const submitStatus = useUIStore((s) => s.submitStatus);
  const setSubmitStatus = useUIStore((s) => s.setSubmitStatus);
  const validationErrors = useUIStore((s) => s.validationErrors);

  const [validating, setValidating] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
    };
  }, []);

  const handleValidate = () => {
    setValidating(true);
    const result = validate();
    setTimeout(() => {
      useUIStore.getState().setValidationErrors(result.errors);
      if (!result.valid) {
        useUIStore.getState().selectNode(null); // deselect to show errors
      }
      setValidating(false);
    }, 100);
  };

  const handleSubmit = async () => {
    const result = validate();
    if (!result.valid) {
      useUIStore.getState().setValidationErrors(result.errors);
      return;
    }
    // Spec is valid — clear any stale validation errors from a prior run.
    useUIStore.getState().setValidationErrors([]);

    // Clear any previous run status and polling
    setExecutionStatus(null);
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setSubmitStatus('submitting');

    try {
      const spec = buildSpec();
      const response = await submitPipeline(spec, tenantId);

      // The pipeline is now persisted server-side under response.pipelineId.
      // Record the canonical identity so the editor knows it is editing a saved
      // entity, and drop the localStorage draft — it only buffered unsaved work
      // and is now obsolete (leaving it would let a page refresh restore a stale
      // draft over the just-saved pipeline). (user-scenario-analysis.md R1)
      setPipelineId(response.pipelineId);
      clearDraft();

      const initialStatus: ExecutionStatus = {
        executionId: response.executionId,
        pipelineId: response.pipelineId,
        status: response.status,
      };
      setExecutionStatus(initialStatus);

      if (response.status === 'succeeded' || response.status === 'failed') {
        // Terminal state already — no polling needed
        setSubmitStatus('success', {
          executionId: response.executionId,
          pipelineId: response.pipelineId,
        });
        return;
      }

      // pending or running — show result in button, poll until terminal
      setSubmitStatus('success', {
        executionId: response.executionId,
        pipelineId: response.pipelineId,
      });

      pollingRef.current = setInterval(async () => {
        try {
          const updated = await getExecution(response.executionId, tenantId);
          setExecutionStatus(updated);
          if (updated.status === 'succeeded' || updated.status === 'failed') {
            if (pollingRef.current !== null) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        } catch {
          if (pollingRef.current !== null) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setExecutionStatus((prev) =>
            prev !== null
              ? { ...prev, status: 'failed', errorMessage: 'Failed to poll execution status' }
              : prev,
          );
        }
      }, 1500);
    } catch (err) {
      setSubmitStatus('error', {
        error: err instanceof Error ? err.message : 'Submission failed',
      });
      setExecutionStatus({
        executionId: '',
        pipelineId: '',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Submission failed',
      });
    }
  };

  const canSubmit = nodes.length >= 2; // at least source + sink
  // ADR-016: multi-Sink fan-out. When ≥2 sinks exist, every batch is broadcast
  // to all sinks; on a sink failure, replay re-delivers to already-succeeded
  // sinks. Sinks must be idempotent — surface this as a non-blocking warning.
  const sinkCount = nodes.filter((n) => n.data.nodeType === 'sink').length;

  // Start a brand-new pipeline: clear any saved draft + the in-memory graph so
  // the user gets a fresh canvas (not a stale draft from a previous session).
  // Confirms first if there's unsaved work in progress.
  const handleNew = () => {
    if (nodes.length > 0 && !window.confirm('Start a new pipeline? Unsaved changes will be discarded.')) {
      return;
    }
    clearDraft();
    reset(tenantId || 'default-tenant');
    useUIStore.getState().setValidationErrors([]);
    useUIStore.getState().setSubmitStatus('idle');
  };

  return (
    <>
    <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
      <button
        onClick={handleNew}
        title="New pipeline"
        aria-label="Start a new pipeline"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <FilePlus2 size={14} aria-hidden />
        New
      </button>
      {/* Pipeline name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pipeline name…"
        className="bg-transparent text-sm font-medium text-foreground placeholder:text-foreground/30 focus:outline-none w-48"
      />

      <div className="flex-1" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={_past.length === 0}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        disabled={_future.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className="p-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Redo2 size={16} />
      </button>

      {/* Validate */}
      <button
        onClick={handleValidate}
        disabled={validating}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-50"
      >
        {validating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <AlertCircle size={14} />
        )}
        Validate
      </button>

      {/* Preview toggle */}
      <button
        onClick={togglePreview}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          showPreview
            ? 'bg-accent/20 text-accent'
            : 'text-foreground/60 hover:text-foreground hover:bg-surface-hover'
        }`}
      >
        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
        Preview
      </button>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitStatus === 'submitting'}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          submitStatus === 'success'
            ? 'bg-accent/20 text-accent'
            : submitStatus === 'error'
              ? 'bg-destructive/20 text-destructive'
              : 'bg-accent text-background hover:bg-accent/90'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {submitStatus === 'submitting' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : submitStatus === 'success' ? (
          <CheckCircle2 size={14} />
        ) : submitStatus === 'error' ? (
          <XCircle size={14} />
        ) : (
          <Play size={14} />
        )}
        {submitStatus === 'submitting'
          ? 'Submitting…'
          : submitStatus === 'success'
            ? (name.trim() ? `Submitted · ${name.trim()}` : 'Submitted')
            : submitStatus === 'error'
              ? 'Failed — Retry'
              : 'Submit'}
      </button>

      {/* Execution status indicator */}
      {executionStatus && (
        <div
          className={`flex items-start gap-1.5 text-xs max-w-md ${
            executionStatus.status === 'failed'
              ? 'text-destructive'
              : executionStatus.status === 'succeeded'
                ? 'text-accent'
                : 'text-warning'
          } ${executionStatus.status === 'failed' ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}
        >
          {(executionStatus.status === 'pending' || executionStatus.status === 'running') && (
            <Loader2 size={14} className="animate-spin shrink-0" />
          )}
          {executionStatus.status === 'succeeded' && (
            <CheckCircle2 size={14} className="shrink-0" />
          )}
          {executionStatus.status === 'failed' && (
            <AlertCircle size={14} className="shrink-0" />
          )}
          <span>
            {executionStatus.status === 'pending' || executionStatus.status === 'running'
              ? 'Running...'
              : executionStatus.status === 'succeeded'
                ? 'Succeeded'
                : `Failed${executionStatus.errorMessage ? ': ' + executionStatus.errorMessage : ''}`}
          </span>
          {/* Deep-link to the execution in the Operate view (unified-ui-design.md
              §4.3: bridge Build -> Operate after submit). */}
          {executionStatus.executionId && (
            <button
              type="button"
              onClick={() => navigate('/executions')}
              className="flex items-center gap-0.5 text-foreground/50 hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
              title="Open this run in Executions"
              aria-label="Open execution in Executions view"
            >
              View
              <ExternalLink size={11} aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* Per-node status badges */}
      {executionStatus?.nodeStatuses && Object.keys(executionStatus.nodeStatuses).length > 0 && (
        <div className="flex flex-wrap gap-1.5 ml-2">
          {Object.entries(executionStatus.nodeStatuses).map(([nodeId, ns]) => (
            <div
              key={nodeId}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                ns.status === 'running'
                  ? 'bg-warning/10 border-warning/30 text-warning'
                  : ns.status === 'completed'
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}
            >
              {ns.status === 'completed' && <CheckCircle2 size={10} />}
              {ns.status === 'failed' && <XCircle size={10} />}
              {ns.status === 'running' && <Loader2 size={10} className="animate-spin" />}
              <span className="truncate max-w-[80px]">{nodeId}</span>
            </div>
          ))}
        </div>
      )}
    </header>
      {/* Multi-Sink idempotency notice (ADR-016 §6). Non-blocking: this is a
          requirement on Sink authors, not a validation error. Every batch is
          broadcast to all sinks; on a sink failure, replay re-delivers to
          already-succeeded sinks, so sinks must tolerate duplicate BatchIDs. */}
      {sinkCount >= 2 && (
        <div className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-1.5 flex items-center gap-2">
          <AlertCircle size={13} className="text-warning shrink-0" aria-hidden />
          <span className="text-xs text-warning/90">
            Multi-Sink fan-out: every batch is sent to all {sinkCount} sinks. Sinks must be idempotent — on a failure, replay re-delivers the same batch.
          </span>
        </div>
      )}
      {/* Validation errors — shown when Validate finds problems or Submit is
          blocked by an invalid spec. Without this the errors were set in the
          store but never rendered, so Submit silently did nothing. */}
      {validationErrors.length > 0 && (
        <div className="shrink-0 max-h-40 overflow-y-auto border-b border-destructive/30 bg-destructive/10 px-4 py-2 flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-semibold text-destructive shrink-0">
            <AlertCircle size={13} aria-hidden />
            {validationErrors.length === 1 ? '1 issue' : `${validationErrors.length} issues`}
          </span>
          {validationErrors.map((err, i) => (
            <span key={i} className="text-xs text-destructive/90 break-words whitespace-normal">
              {err}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
