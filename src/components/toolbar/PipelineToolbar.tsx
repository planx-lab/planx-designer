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
} from 'lucide-react';

import { usePipelineStore } from '@/stores/usePipelineStore';
import { useUIStore } from '@/stores/useUIStore';
import { submitPipeline, getExecution } from '@/api/controlPlane';
import type { ExecutionStatus } from '@/api/controlPlane';

export function PipelineToolbar() {
  const name = usePipelineStore((s) => s.name);
  const setName = usePipelineStore((s) => s.setName);
  const tenantId = usePipelineStore((s) => s.tenantId);
  const buildSpec = usePipelineStore((s) => s.buildSpec);
  const validate = usePipelineStore((s) => s.validate);
  const nodes = usePipelineStore((s) => s.nodes);

  const undo = usePipelineStore((s) => s.undo);
  const redo = usePipelineStore((s) => s.redo);
  const _past = usePipelineStore((s) => s._past);
  const _future = usePipelineStore((s) => s._future);
  const showPreview = useUIStore((s) => s.showPreview);
  const togglePreview = useUIStore((s) => s.togglePreview);
  const submitStatus = useUIStore((s) => s.submitStatus);
  const submitResult = useUIStore((s) => s.submitResult);
  const setSubmitStatus = useUIStore((s) => s.setSubmitStatus);

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

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
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
        className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        disabled={_future.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
            ? `Submitted: ${submitResult?.pipelineId?.slice(0, 8) ?? 'ok'}`
            : submitStatus === 'error'
              ? 'Failed — Retry'
              : 'Submit'}
      </button>

      {/* Execution status indicator */}
      {executionStatus && (
        <div
          className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${
            executionStatus.status === 'succeeded'
              ? 'text-green-400'
              : executionStatus.status === 'failed'
                ? 'text-red-400'
                : 'text-yellow-400'
          }`}
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
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                  : ns.status === 'completed'
                    ? 'bg-green-500/10 border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
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
  );
}
